import { DurableObject } from "cloudflare:workers";
import {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  TunnelMessage,
} from "./types";

function generateClientId(): string {
  return Math.random().toString(36).substr(2, 9);
}

interface Env {
  TUNNEL_KV: KVNamespace;
  TUNNEL_DOMAIN: string;
}

export class TunnelDO extends DurableObject<Env> {
  
  clients: Map<string, WebSocket> = new Map();
  pendingRequests: Map<string, { resolve: (res: Response) => void; reject: (err: Error) => void; url: string }>;
  clientId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.pendingRequests = new Map();
  }

  async initialize() {
    if (!this.clientId) {
      this.clientId = await this.ctx.storage.get('clientId') as string;
      console.log('Initialized clientId:', this.clientId, 'for DO:', this.ctx.id.toString());
      if (!this.clientId) {
        console.log('No clientId in DO storage for DO:', this.ctx.id.toString());
      }
    }
  }



  async fetch(request: Request) {
    await this.initialize();

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const client = webSocketPair[0];
      const server = webSocketPair[1];

      server.accept();
      this.handleWebSocket(server, request);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    console.log('HTTP request for clientId:', this.clientId);
    if (!this.clientId) {
      console.log('Client not connected or no clientId');
      return new Response("Client not connected", { status: 503 });
    }

    if (!this.clients.has(this.clientId)) {
      return new Response("Client not connected", { status: 503 });
    }

    const reqId = Math.random().toString(36).substr(2, 9);
    console.log('Sending request to client:', reqId, request.method, request.url);
    const requestData: RequestMessage = {
      type: 'request',
      id: reqId,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null,
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
      }, 30000);
    }).catch(() => new Response("Timeout", { status: 504 }));
  }

  async handleWebSocket(ws: WebSocket, request: Request) {
    if (!this.clientId) {
      this.clientId = request.headers.get('X-Client-Id') || await this.ctx.storage.get('clientId') as string;
    }
    console.log('Handling WS for clientId:', this.clientId);
    if (!this.clientId) return;

    this.clients.set(this.clientId, ws);
    await this.ctx.storage.put('clientId', this.clientId);

    // Send tunnel URL
    const domain = this.env.TUNNEL_DOMAIN || 'localhost';
    const isDev = domain === 'localhost';
    const protocol = isDev ? 'http' : 'https';
    const port = isDev ? ':8787' : '';
    const tunnelUrl = `${protocol}://${this.clientId}.${domain}${port}`;
    const tunnelMessage: TunnelMessage = {
      type: 'tunnel',
      url: tunnelUrl,
    };
    ws.send(JSON.stringify(tunnelMessage));

    ws.addEventListener("message", (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data as string);
        console.log("WS message:", data.type, (data as any)?.id);
        if (data?.type === "response") {
          const resMsg = data as ResponseMessage;
          const pending = this.pendingRequests.get(resMsg.id);
          if (pending) {
            this.pendingRequests.delete(resMsg.id);
            const headers = { ...resMsg.headers };
            if (pending.url.includes('.js') && !headers['content-type']) {
              headers['content-type'] = 'application/javascript';
            }
            let body: string | Uint8Array;
            if (resMsg.body.type === 'binary') {
              body = new Uint8Array(Buffer.from(resMsg.body.data, 'base64'));
            } else {
              body = resMsg.body.data;
            }
            const response = new Response(body, {
              status: resMsg.status,
              headers,
            });
            console.log("Resolving request:", resMsg.id);
            pending.resolve(response);
          } else {
            console.log("No pending request for:", resMsg.id);
          }
        }
      } catch (e) {
        console.error("Invalid message:", event.data);
      }
    });

    ws.addEventListener("close", () => {
      this.clients.delete(this.clientId as string);
      this.env.TUNNEL_KV.delete(this.clientId as string);
      // Reject pending
      for (const [id, { reject }] of this.pendingRequests) {
        reject(new Error("Client disconnected"));
      }
      this.pendingRequests.clear();
    });
  }
}
