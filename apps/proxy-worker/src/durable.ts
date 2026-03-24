import { DurableObject } from "cloudflare:workers";
import {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  ResponseStartMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  TunnelMessage,
} from "./types";
import { isWebSocketUpgrade } from "./websocket";

interface Env {
  TUNNEL_KV: KVNamespace;
  TUNNEL_DOMAIN: string;
}

const CONTROL_SOCKET_TAG = "control";
const CONTROL_CONNECTION_TAG_PREFIX = "control-connection:";
const REQUEST_TIMEOUT_MS = 60000;
const textEncoder = new TextEncoder();

interface PendingResponseStream {
  controller: ReadableStreamDefaultController<Uint8Array>;
  bodyType: "text" | "binary";
  timeout: ReturnType<typeof setTimeout> | null;
}

interface PendingRequest {
  resolve: (res: Response) => void;
  reject: (err: Error) => void;
  url: string;
  method: string;
  timeout: ReturnType<typeof setTimeout> | null;
  responseStream: PendingResponseStream | null;
}

export class TunnelDO extends DurableObject<Env> {
  clients: Map<string, WebSocket> = new Map();
  pendingRequests: Map<string, PendingRequest>;
  clientId: string | null = null;
  reconnectToken: string | null = null;
  activeConnectionId: string | null = null;
  pingInterval: NodeJS.Timeout | null = null;
  pongTimeout: NodeJS.Timeout | null = null;
  disconnectCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.pendingRequests = new Map();
  }

  async initialize() {
    if (!this.clientId || !this.reconnectToken) {
      this.clientId =
        this.clientId ?? ((await this.ctx.storage.get("clientId")) as string);
      this.reconnectToken =
        this.reconnectToken ??
        ((await this.ctx.storage.get("reconnectToken")) as string);
      console.log(
        "Initialized clientId:",
        this.clientId,
        "for DO:",
        this.ctx.id.toString()
      );
      if (!this.clientId) {
        console.log(
          "No clientId in DO storage for DO:",
          this.ctx.id.toString()
        );
      }
    }
  }

  // Get the control WebSocket (from CLI)
  getControlWebSocket(): WebSocket | null {
    const allWebSockets = this.ctx.getWebSockets();
    let fallbackControlSocket: WebSocket | null = null;

    for (const ws of allWebSockets) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const tags = this.ctx.getTags(ws);
      if (
        this.activeConnectionId &&
        tags.includes(`${CONTROL_CONNECTION_TAG_PREFIX}${this.activeConnectionId}`)
      ) {
        return ws;
      }

      if (tags.includes(CONTROL_SOCKET_TAG)) {
        fallbackControlSocket = ws;
      }
    }

    return fallbackControlSocket;
  }

  scheduleDisconnectCleanup() {
    if (this.disconnectCleanupTimer !== null) {
      clearTimeout(this.disconnectCleanupTimer);
    }

    this.disconnectCleanupTimer = setTimeout(() => {
      this.disconnectCleanupTimer = null;

      if (this.getControlWebSocket()) {
        return;
      }

      for (const reqId of this.pendingRequests.keys()) {
        this.failPendingRequest(reqId, new Error("Client disconnected"));
      }
    }, 5000);
  }

  clearPendingTimeout(pending: PendingRequest) {
    if (pending.timeout !== null) {
      clearTimeout(pending.timeout);
      pending.timeout = null;
    }
  }

  clearResponseStreamTimeout(stream: PendingResponseStream | null) {
    if (stream && stream.timeout !== null) {
      clearTimeout(stream.timeout);
      stream.timeout = null;
    }
  }

  refreshResponseStreamTimeout(reqId: string) {
    const pending = this.pendingRequests.get(reqId);
    if (!pending?.responseStream) {
      return;
    }

    this.clearResponseStreamTimeout(pending.responseStream);
    pending.responseStream.timeout = setTimeout(() => {
      this.failPendingRequest(reqId, new Error("Response stream timeout"));
    }, REQUEST_TIMEOUT_MS);
  }

  failPendingRequest(reqId: string, error: Error) {
    const pending = this.pendingRequests.get(reqId);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(reqId);
    this.clearPendingTimeout(pending);
    this.clearResponseStreamTimeout(pending.responseStream);

    if (pending.responseStream) {
      try {
        pending.responseStream.controller.error(error);
      } catch {}
      return;
    }

    pending.reject(error);
  }

  decodeBase64Chunk(data: string): Uint8Array {
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  isNullBodyStatus(status: number): boolean {
    return status === 204 || status === 205 || status === 304;
  }

  async fetch(request: Request) {
    await this.initialize();

    const internalAction = request.headers.get("X-Internal-Action");
    if (internalAction === "status") {
      return Response.json({ active: this.getControlWebSocket() !== null });
    }

    if (internalAction === "release") {
      const reconnectToken = request.headers.get("X-Reconnect-Token");

      if (!reconnectToken || !this.reconnectToken || reconnectToken !== this.reconnectToken) {
        return new Response("Unauthorized", { status: 401 });
      }

      await this.ctx.storage.delete("clientId");
      await this.ctx.storage.delete("reconnectToken");
      this.clientId = null;
      this.reconnectToken = null;

      return new Response(null, { status: 204 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    const reconnectHeader = request.headers.get("X-Provided-Id");
    const reconnectToken = request.headers.get("X-Reconnect-Token");
    const connectionId = request.headers.get("X-Connection-Id");
    const isControlWs = request.headers.get("X-Client-Id") !== null;

    if (isWebSocketUpgrade(upgradeHeader)) {
      // Determine if this is a control WebSocket (from CLI) or external WebSocket (from user)
      if (isControlWs || reconnectHeader) {
        if (!reconnectToken) {
          return new Response("Missing reconnect token", { status: 400 });
        }

        if (!connectionId) {
          return new Response("Missing connection ID", { status: 400 });
        }

        if (this.reconnectToken && this.reconnectToken !== reconnectToken) {
          return new Response("Client ID is already taken or currently in use", {
            status: 409,
          });
        }

        // This is the control WebSocket from CLI
        const webSocketPair = new WebSocketPair();
        const client = webSocketPair[0];
        const server = webSocketPair[1];

        this.ctx.acceptWebSocket(server, [
          CONTROL_SOCKET_TAG,
          `${CONTROL_CONNECTION_TAG_PREFIX}${connectionId}`,
        ]);
        this.handleWebSocket(server, request);

        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      } else {
        return new Response("WebSocket passthrough is disabled", {
          status: 501,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        });
      }
    }

    console.log("HTTP request for clientId:", this.clientId);
    if (!this.clientId) {
      console.log("Client not connected or no clientId");
      return new Response("Client not connected", { status: 503 });
    }

    const controlWs = this.getControlWebSocket();
    if (!controlWs) {
      return new Response("Client not connected", { status: 503 });
    }

    const reqId = Math.random().toString(36).substr(2, 9);
    console.log(
      "Sending HTTP request to client:",
      reqId,
      request.method,
      request.url
    );

    const requestData: RequestMessage = {
      type: "request",
      id: reqId,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? await request.text()
          : null,
    };

    return new Promise<Response>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failPendingRequest(reqId, new Error("Timeout"));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(reqId, {
        resolve,
        reject,
        url: request.url,
        method: request.method,
        timeout,
        responseStream: null,
      });

      try {
        controlWs.send(JSON.stringify(requestData));
      } catch (error) {
        console.error("Failed to send HTTP request to control websocket:", error);
        this.failPendingRequest(reqId, new Error("Client disconnected"));
        return;
      }
    }).catch((error: Error) => {
      if (error.message === "Client disconnected") {
        return new Response("Client disconnected", { status: 503 });
      }

      return new Response("Timeout", { status: 504 });
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data: WSMessage = JSON.parse(message as string);
      console.log("WS message:", data.type, (data as any)?.id || (data as any)?.streamId);

      if (data?.type === "response") {
        try {
          const resMsg = data as ResponseMessage;
          const pending = this.pendingRequests.get(resMsg.id);
          if (pending) {
            this.pendingRequests.delete(resMsg.id);
            this.clearPendingTimeout(pending);
            this.clearResponseStreamTimeout(pending.responseStream);
            let body: string | Uint8Array;
            if (resMsg.body.type === "binary") {
              try {
                body = this.decodeBase64Chunk(resMsg.body.data);
              } catch (e) {
                console.error("Invalid base64 in response body:", e);
                body = new Uint8Array(0);
              }
            } else {
              body = resMsg.body.data;
            }
            const response = new Response(body, {
              status: resMsg.status,
              headers: resMsg.headers,
            });
            console.log("Resolving request:", resMsg.id);
            pending.resolve(response);
          } else {
            console.log("No pending request for:", resMsg.id);
          }
        } catch (e) {
          console.error("Error processing response message:", e);
        }
      } else if (data.type === "response_start") {
        const resMsg = data as ResponseStartMessage;
        const pending = this.pendingRequests.get(resMsg.id);

        if (!pending) {
          console.log("No pending request for response_start:", resMsg.id);
          return;
        }

        if (pending.responseStream) {
          console.log("Duplicate response_start for:", resMsg.id);
          return;
        }

        this.clearPendingTimeout(pending);

        if (
          pending.method === "HEAD" ||
          this.isNullBodyStatus(resMsg.status)
        ) {
          this.pendingRequests.delete(resMsg.id);
          const response = new Response(null, {
            status: resMsg.status,
            headers: resMsg.headers,
          });

          console.log("Resolving null-body response:", resMsg.id);
          pending.resolve(response);
          return;
        }

        let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
          null;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controllerRef = controller;
          },
          cancel: () => {
            const current = this.pendingRequests.get(resMsg.id);
            if (!current) {
              return;
            }

            this.clearPendingTimeout(current);
            this.clearResponseStreamTimeout(current.responseStream);
            this.pendingRequests.delete(resMsg.id);
          },
        });

        if (!controllerRef) {
          this.failPendingRequest(
            resMsg.id,
            new Error("Failed to initialize response stream")
          );
          return;
        }

        pending.responseStream = {
          controller: controllerRef,
          bodyType: resMsg.bodyType,
          timeout: null,
        };
        this.refreshResponseStreamTimeout(resMsg.id);

        const response = new Response(stream, {
          status: resMsg.status,
          headers: resMsg.headers,
        });

        console.log("Starting streamed response:", resMsg.id);
        pending.resolve(response);
      } else if (data.type === "response_chunk") {
        const chunkMsg = data as ResponseChunkMessage;
        const pending = this.pendingRequests.get(chunkMsg.id);

        if (!pending?.responseStream) {
          console.log("No pending response stream for:", chunkMsg.id);
          return;
        }

        try {
          const chunk =
            pending.responseStream.bodyType === "binary"
              ? this.decodeBase64Chunk(chunkMsg.data)
              : textEncoder.encode(chunkMsg.data);

          pending.responseStream.controller.enqueue(chunk);
          this.refreshResponseStreamTimeout(chunkMsg.id);
        } catch (error) {
          console.error("Error processing response chunk:", error);
          this.failPendingRequest(
            chunkMsg.id,
            new Error("Invalid streamed response chunk")
          );
        }
      } else if (data.type === "response_end") {
        const endMsg = data as ResponseEndMessage;
        const pending = this.pendingRequests.get(endMsg.id);

        if (!pending?.responseStream) {
          console.log("No pending response stream to end for:", endMsg.id);
          return;
        }

        this.pendingRequests.delete(endMsg.id);
        this.clearPendingTimeout(pending);
        this.clearResponseStreamTimeout(pending.responseStream);

        try {
          pending.responseStream.controller.close();
        } catch (error) {
          console.error("Error closing response stream:", error);
        }

        console.log("Finished streamed response:", endMsg.id);
      } else if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        console.log("Sent pong to client");
      } else if (data.type === "pong") {
        // Received pong from client, keepalive ok
        console.log("Received pong from client");
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
      }
    } catch (e) {
      console.error("Invalid message:", message);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: Boolean
  ) {
    // Control WebSocket (CLI) closed
    console.log(
      `Client ${this.clientId} disconnected, code: ${code}, reason: ${reason}`
    );
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);

    const replacementControlWs = this.getControlWebSocket();
    if (replacementControlWs && replacementControlWs !== ws) {
      return;
    }

    this.activeConnectionId = null;
    this.scheduleDisconnectCleanup();
  }

  async handleWebSocket(ws: WebSocket, request: Request) {
    const reconnectToken = request.headers.get("X-Reconnect-Token");
    const connectionId = request.headers.get("X-Connection-Id");

    if (!this.clientId) {
      this.clientId =
        request.headers.get("X-Client-Id") ||
        ((await this.ctx.storage.get("clientId")) as string);
    }

    if (!this.reconnectToken) {
      this.reconnectToken =
        reconnectToken || ((await this.ctx.storage.get("reconnectToken")) as string);
    }

    // console.log("Handling WS for clientId:", this.clientId);
    if (!this.clientId || !this.reconnectToken || !connectionId) return;

    if (this.disconnectCleanupTimer !== null) {
      clearTimeout(this.disconnectCleanupTimer);
      this.disconnectCleanupTimer = null;
    }

    this.activeConnectionId = connectionId;

    for (const existingControlWs of this.ctx.getWebSockets()) {
      if (existingControlWs === ws || existingControlWs.readyState !== WebSocket.OPEN) {
        continue;
      }

      const tags = this.ctx.getTags(existingControlWs);
      if (!tags.includes(CONTROL_SOCKET_TAG)) {
        continue;
      }

      try {
        existingControlWs.close(1012, "Reconnected from another session");
      } catch (error) {
        console.error("Failed to close existing control websocket:", error);
      }
    }

    this.clients.set(this.clientId, ws);
    await this.ctx.storage.put("clientId", this.clientId);
    await this.ctx.storage.put("reconnectToken", this.reconnectToken);

    // Send tunnel URL
    const domain = this.env.TUNNEL_DOMAIN || "localhost";
    const isDev = domain === "localhost";
    const protocol = isDev ? "http" : "https";
    const port = isDev ? ":8787" : "";
    const tunnelUrl = `${protocol}://${this.clientId}.${domain}${port}`;
    const tunnelMessage: TunnelMessage = {
      type: "tunnel",
      url: tunnelUrl,
    };
    ws.send(JSON.stringify(tunnelMessage));

    const startKeepalive = () => {
      this.pingInterval = setInterval(() => {
        ws.send(JSON.stringify({ type: "ping" }));
        this.pongTimeout = setTimeout(() => {
          console.log("No pong received from client, closing connection");
        }, 10000);
      }, 30000);
    };
  }
}
