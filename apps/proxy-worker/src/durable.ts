import { DurableObject } from "cloudflare:workers";
import {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  ResponseStartMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  TunnelMessage,
  RequestCancelMessage,
} from "./types";
import { isWebSocketUpgrade } from "./websocket";

interface Env {
  TUNNEL_KV: KVNamespace;
  TUNNEL_DOMAIN: string;
}

/* ------------------------------------------------------------------ */
/*  Metrics                                                            */
/* ------------------------------------------------------------------ */

interface TunnelMetrics {
  wakes: number;
  controlConnections: number;
  totalRequests: number;
  streamedResponses: number;
  cancellations: number;
  timeouts: number;
  chunksSent: number;
  startedAt: number;
}

const METRICS_STORAGE_KEY = "_metrics";

function emptyMetrics(): TunnelMetrics {
  return {
    wakes: 0,
    controlConnections: 0,
    totalRequests: 0,
    streamedResponses: 0,
    cancellations: 0,
    timeouts: 0,
    chunksSent: 0,
    startedAt: Date.now(),
  };
}

async function loadMetrics(storage: DurableObjectStorage): Promise<TunnelMetrics> {
  const raw = await storage.get<TunnelMetrics>(METRICS_STORAGE_KEY);
  if (!raw) {
    return emptyMetrics();
  }
  return raw;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CONTROL_SOCKET_TAG = "control";
const CONTROL_CONNECTION_TAG_PREFIX = "control-connection:";
const REQUEST_TIMEOUT_MS = 60000;
const textEncoder = new TextEncoder();

interface ControlSocketAttachment {
  kind: "control";
  clientId: string;
  reconnectToken: string;
  connectionId: string;
}

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

/* ------------------------------------------------------------------ */
/*  TunnelDO                                                           */
/* ------------------------------------------------------------------ */

export class TunnelDO extends DurableObject<Env> {
  clients: Map<string, WebSocket> = new Map();
  pendingRequests: Map<string, PendingRequest>;
  clientId: string | null = null;
  reconnectToken: string | null = null;
  activeConnectionId: string | null = null;
  disconnectCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  metrics: TunnelMetrics = emptyMetrics();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.pendingRequests = new Map();
    this.metrics = emptyMetrics();
    this.restoreHibernatedSockets();
    this.loadAndBumpMetrics();
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" } satisfies WSMessage),
        JSON.stringify({ type: "pong" } satisfies WSMessage)
      )
    );
  }

  /* ---- metrics helpers ------------------------------------------- */

  async loadAndBumpMetrics() {
    const stored = await loadMetrics(this.ctx.storage);
    stored.wakes++;
    this.metrics = stored;
    this.ctx.storage.put(METRICS_STORAGE_KEY, this.metrics);
  }

  flushMetrics() {
    this.ctx.storage.put(METRICS_STORAGE_KEY, this.metrics);
  }

  /* ---- hibernation restore --------------------------------------- */

  restoreHibernatedSockets() {
    for (const ws of this.ctx.getWebSockets(CONTROL_SOCKET_TAG)) {
      const attachment = ws.deserializeAttachment() as ControlSocketAttachment | null;
      if (!attachment || attachment.kind !== "control") {
        continue;
      }

      this.clientId = attachment.clientId;
      this.reconnectToken = attachment.reconnectToken;
      this.activeConnectionId = attachment.connectionId;
      this.clients.set(attachment.clientId, ws);
    }
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
  }

  failPendingRequest(reqId: string, error: Error, cancelUpstream = false) {
    const pending = this.pendingRequests.get(reqId);
    if (!pending) {
      return;
    }

    if (cancelUpstream) {
      this.sendRequestCancel(reqId);
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

  sendRequestCancel(reqId: string) {
    this.metrics.cancellations++;
    this.flushMetrics();

    const controlWs = this.getControlWebSocket();
    if (!controlWs) {
      return;
    }

    try {
      controlWs.send(
        JSON.stringify({ type: "request_cancel", id: reqId } satisfies RequestCancelMessage)
      );
    } catch (error) {
      console.error("Failed to send request cancellation:", error);
    }
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

  /* ---- HTTP fetch ------------------------------------------------- */

  async fetch(request: Request) {
    await this.initialize();

    const internalAction = request.headers.get("X-Internal-Action");
    if (internalAction === "status") {
      return Response.json({
        active: this.getControlWebSocket() !== null,
        clientId: this.clientId,
        activeRequests: this.pendingRequests.size,
        metrics: this.metrics,
      });
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
        server.serializeAttachment({
          kind: "control",
          clientId: request.headers.get("X-Client-Id") || reconnectHeader || this.clientId || "",
          reconnectToken,
          connectionId,
        } satisfies ControlSocketAttachment);
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

    this.metrics.totalRequests++;
    if (this.metrics.totalRequests % 50 === 0) {
      this.flushMetrics();
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
      const abortPendingRequest = () => {
        this.failPendingRequest(reqId, new Error("Client disconnected"), true);
      };
      const timeout = setTimeout(() => {
        request.signal.removeEventListener("abort", abortPendingRequest);
        this.failPendingRequest(reqId, new Error("Timeout"), true);
        this.metrics.timeouts++;
        this.flushMetrics();
      }, REQUEST_TIMEOUT_MS);

      request.signal.addEventListener("abort", abortPendingRequest, { once: true });

      this.pendingRequests.set(reqId, {
        resolve: (res) => {
          request.signal.removeEventListener("abort", abortPendingRequest);
          resolve(res);
        },
        reject: (err) => {
          request.signal.removeEventListener("abort", abortPendingRequest);
          reject(err);
        },
        url: request.url,
        method: request.method,
        timeout,
        responseStream: null,
      });

      if (request.signal.aborted) {
        abortPendingRequest();
        return;
      }

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

  /* ---- WebSocket message handler ---------------------------------- */

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
        this.metrics.streamedResponses++;
        this.flushMetrics();

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
            this.sendRequestCancel(resMsg.id);
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
        this.metrics.chunksSent++;
        if (this.metrics.chunksSent % 200 === 0) {
          this.flushMetrics();
        }

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
            new Error("Invalid streamed response chunk"),
            true
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
      }
    } catch (e) {
      console.error("Invalid message:", message);
    }
  }

  /* ---- WebSocket close handler ------------------------------------ */

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

    const replacementControlWs = this.getControlWebSocket();
    if (replacementControlWs && replacementControlWs !== ws) {
      return;
    }

    this.activeConnectionId = null;
    this.scheduleDisconnectCleanup();
  }

  /* ---- Control WebSocket handshake --------------------------------- */

  async handleWebSocket(ws: WebSocket, request: Request) {
    this.metrics.controlConnections++;
    this.flushMetrics();

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
    ws.serializeAttachment({
      kind: "control",
      clientId: this.clientId,
      reconnectToken: this.reconnectToken,
      connectionId,
    } satisfies ControlSocketAttachment);
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
  }
}
