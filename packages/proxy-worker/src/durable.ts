import { DurableObject } from "cloudflare:workers";
import {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  TunnelMessage,
} from "./types";

interface Env {
  TUNNEL_KV: KVNamespace;
  TUNNEL_DOMAIN: string;
}

export class TunnelDO extends DurableObject<Env> {
  clients: Map<string, WebSocket> = new Map();
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

  async fetch(request: Request) {
    await this.initialize();

    const upgradeHeader = request.headers.get("Upgrade");
    const reconnectHeader = request.headers.get("X-Provided-Id")
    if (upgradeHeader === "websocket") {
      const webSocketPair = new WebSocketPair();
      const client = webSocketPair[0];
      const server = webSocketPair[1];


      if (this.clientId && !reconnectHeader) {
        // Reject unsupported protocol upgrades, including WebSockets
        return new Response("Protocol not supported", { status: 501 });
      }

      this.ctx.acceptWebSocket(server);
      this.handleWebSocket(server, request);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    console.log("HTTP request for clientId:", this.clientId);
    if (!this.clientId) {
      console.log("Client not connected or no clientId");
      return new Response("Client not connected", { status: 503 });
    }

    if (!this.clients.has(this.clientId)) {
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

    this.clients.get(this.clientId!)!.send(JSON.stringify(requestData));

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

  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data: WSMessage = JSON.parse(message);
      console.log("WS message:", data.type, (data as any)?.id);
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
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    console.log(
      `Client ${this.clientId} disconnected, code: ${code}, reason: ${reason}`
    );
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);

    // if (event.code === 1000) {
    //   this.clients.delete(this.clientId as string);
    //   this.env.TUNNEL_KV.delete(this.clientId as string);
    // }
    // Reject pending
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
          // ws.close();
        }, 10000);
      }, 30000);
    };

    startKeepalive();
  }
}
