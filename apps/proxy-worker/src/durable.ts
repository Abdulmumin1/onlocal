import { DurableObject } from "cloudflare:workers";
import {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  TunnelMessage,
  WsOpenMessage,
  WsFrameMessage,
  WsCloseMessage,
} from "./types";

interface Env {
  TUNNEL_KV: KVNamespace;
  TUNNEL_DOMAIN: string;
}

export class TunnelDO extends DurableObject<Env> {
  clients: Map<string, WebSocket> = new Map();
  // Track external WebSocket connections (streamId -> WebSocket)
  externalWsSockets: Map<string, WebSocket> = new Map();
  pendingRequests: Map<
    string,
    {
      resolve: (res: Response) => void;
      reject: (err: Error) => void;
      url: string;
    }
  >;
  clientId: string | null = null;
  pingInterval: NodeJS.Timeout | null = null;
  pongTimeout: NodeJS.Timeout | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.pendingRequests = new Map();
  }

  async initialize() {
    if (!this.clientId) {
      this.clientId = (await this.ctx.storage.get("clientId")) as string;
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
    // Use ctx.getWebSockets() to find the control WS (the one without a streamId tag)
    const allWebSockets = this.ctx.getWebSockets();
    for (const ws of allWebSockets) {
      const tags = this.ctx.getTags(ws);
      // Control WebSocket has no tags (or we could tag it specifically)
      // External WebSockets have a streamId tag (9 chars)
      const hasStreamId = tags.some(tag => tag.length === 9);
      if (!hasStreamId) {
        return ws;
      }
    }
    return null;
  }

  // Get an external WebSocket by streamId
  getExternalWebSocket(streamId: string): WebSocket | null {
    const allWebSockets = this.ctx.getWebSockets();
    for (const ws of allWebSockets) {
      const tags = this.ctx.getTags(ws);
      if (tags.includes(streamId)) {
        return ws;
      }
    }
    return null;
  }

  async fetch(request: Request) {
    await this.initialize();

    const upgradeHeader = request.headers.get("Upgrade");
    const reconnectHeader = request.headers.get("X-Provided-Id");
    const isControlWs = request.headers.get("X-Client-Id") !== null;

    if (upgradeHeader === "websocket") {
      // Determine if this is a control WebSocket (from CLI) or external WebSocket (from user)
      if (isControlWs || reconnectHeader) {
        // This is the control WebSocket from CLI
        const webSocketPair = new WebSocketPair();
        const client = webSocketPair[0];
        const server = webSocketPair[1];

        this.ctx.acceptWebSocket(server);
        this.handleWebSocket(server, request);

        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      } else {
        // This is an external WebSocket connection - passthrough to CLI
        return this.handleExternalWebSocket(request);
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

    controlWs.send(JSON.stringify(requestData));

    return new Promise<Response>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject, url: request.url });

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error("Timeout"));
        }
      }, 60000);
    }).catch(() => new Response("Timeout", { status: 504 }));
  }

  // Handle external WebSocket connections (passthrough to CLI)
  async handleExternalWebSocket(request: Request): Promise<Response> {
    if (!this.clientId) {
      return new Response("Client not connected", { status: 503 });
    }

    const controlWs = this.getControlWebSocket();
    if (!controlWs) {
      return new Response("Client not connected", { status: 503 });
    }

    // Create WebSocket pair for external client
    const webSocketPair = new WebSocketPair();
    const clientSocket = webSocketPair[0];
    const serverSocket = webSocketPair[1];

    // Generate unique stream ID for this WebSocket connection
    const streamId = Math.random().toString(36).substr(2, 9);

    // Accept the WebSocket
    this.ctx.acceptWebSocket(serverSocket, [streamId]);  // Tag with streamId

    // Store the external WebSocket
    this.externalWsSockets.set(streamId, serverSocket);

    console.log("External WebSocket connection, streamId:", streamId);

    // Send ws_open message to CLI
    const wsOpenMessage: WsOpenMessage = {
      type: "ws_open",
      streamId,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
    };
    controlWs.send(JSON.stringify(wsOpenMessage));

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Check if this is from an external WebSocket (has streamId tag)
    const tags = this.ctx.getTags(ws);
    const streamId = tags.find(tag => tag.length === 9);  // streamId is 9 chars

    if (streamId) {
      // This is a message from an external WebSocket - forward to CLI
      const controlWs = this.getControlWebSocket();
      if (!controlWs) {
        console.log("No control WebSocket to forward external WS message");
        return;
      }

      let wsFrameMessage: WsFrameMessage;
      if (message instanceof ArrayBuffer) {
        // Binary message
        const bytes = new Uint8Array(message);
        let binaryString = '';
        for (let i = 0; i < bytes.length; i++) {
          binaryString += String.fromCharCode(bytes[i]);
        }
        wsFrameMessage = {
          type: "ws_frame",
          streamId,
          data: btoa(binaryString),
          isBinary: true,
        };
      } else {
        // Text message
        wsFrameMessage = {
          type: "ws_frame",
          streamId,
          data: message,
          isBinary: false,
        };
      }
      controlWs.send(JSON.stringify(wsFrameMessage));
      console.log("Forwarded external WS frame to CLI, streamId:", streamId);
      return;
    }

    // This is a message from the control WebSocket (CLI)
    try {
      const data: WSMessage = JSON.parse(message as string);
      console.log("WS message:", data.type, (data as any)?.id || (data as any)?.streamId);

      if (data?.type === "response") {
        try {
          const resMsg = data as ResponseMessage;
          const pending = this.pendingRequests.get(resMsg.id);
          if (pending) {
            this.pendingRequests.delete(resMsg.id);
            let body: string | Uint8Array;
            console.log(resMsg);
            if (resMsg.body.type === "binary") {
              try {
                const binaryString = atob(resMsg.body.data);
                body = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  body[i] = binaryString.charCodeAt(i);
                }
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
      } else if (data.type === "ws_frame") {
        // Forward frame to external WebSocket
        const frameMsg = data as WsFrameMessage;
        const externalWs = this.getExternalWebSocket(frameMsg.streamId);
        if (externalWs) {
          if (frameMsg.isBinary) {
            // Decode base64 to binary
            const binaryString = atob(frameMsg.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            externalWs.send(bytes);
          } else {
            externalWs.send(frameMsg.data);
          }
          console.log("Forwarded CLI frame to external WS, streamId:", frameMsg.streamId);
        } else {
          console.log("No external WS found for streamId:", frameMsg.streamId);
        }
      } else if (data.type === "ws_close") {
        // Close external WebSocket
        const closeMsg = data as WsCloseMessage;
        const externalWs = this.getExternalWebSocket(closeMsg.streamId);
        if (externalWs) {
          externalWs.close(closeMsg.code || 1000, closeMsg.reason || "");
          this.externalWsSockets.delete(closeMsg.streamId);
          console.log("Closed external WS, streamId:", closeMsg.streamId);
        }
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
    // Check if this is an external WebSocket close
    const tags = this.ctx.getTags(ws);
    const streamId = tags.find(tag => tag.length === 9);

    if (streamId) {
      // External WebSocket closed - notify CLI
      console.log(`External WebSocket closed, streamId: ${streamId}, code: ${code}, reason: ${reason}`);
      this.externalWsSockets.delete(streamId);

      const controlWs = this.getControlWebSocket();
      if (controlWs) {
        const wsCloseMessage: WsCloseMessage = {
          type: "ws_close",
          streamId,
          code,
          reason,
        };
        controlWs.send(JSON.stringify(wsCloseMessage));
      }
      return;
    }

    // Control WebSocket (CLI) closed
    console.log(
      `Client ${this.clientId} disconnected, code: ${code}, reason: ${reason}`
    );
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);

    // Close all external WebSockets (those with streamId tags)
    const allWebSockets = this.ctx.getWebSockets();
    for (const extWs of allWebSockets) {
      const tags = this.ctx.getTags(extWs);
      const hasStreamId = tags.some(tag => tag.length === 9);
      if (hasStreamId) {
        try {
          extWs.close(1001, "Tunnel disconnected");
        } catch (e) {
          // Ignore close errors
        }
      }
    }
    this.externalWsSockets.clear();

    // Reject pending HTTP requests
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error("Client disconnected"));
    }
    this.pendingRequests.clear();
  }

  async handleWebSocket(ws: WebSocket, request: Request) {
    if (!this.clientId) {
      this.clientId =
        request.headers.get("X-Client-Id") ||
        ((await this.ctx.storage.get("clientId")) as string);
    }
    // console.log("Handling WS for clientId:", this.clientId);
    if (!this.clientId) return;

    this.clients.set(this.clientId, ws);
    await this.ctx.storage.put("clientId", this.clientId);

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
