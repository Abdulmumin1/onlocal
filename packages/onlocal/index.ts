#!/usr/bin/env node

interface WSMessage {
  type: "request" | "response" | "port" | "tunnel" | "ping" | "pong";
}

interface RequestMessage extends WSMessage {
  type: "request";
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

interface ResponseMessage extends WSMessage {
  type: "response";
  id: string;
  status: number;
  headers: Record<string, string>;
  body: { type: "text" | "binary"; data: string };
}

interface PortMessage extends WSMessage {
  type: "port";
  port: number;
}

interface TunnelMessage extends WSMessage {
  type: "tunnel";
  url: string;
}

const colors = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
};

const port = parseInt(process.argv[2] as string);
if (!port || isNaN(port)) {
  console.log(`${colors.cyan}Usage: bun index.ts <port>${colors.reset}`);
  process.exit(1);
}

class tunnelClient {
  clientId: string = "";
  env: { TUNNEL_DOMAIN?: string };
  maxConcurrent = 20;
  activeRequests: number = 0;
  backoffDelay: number = 1000;
  isRetry: boolean = false;

  constructor(
    env: { TUNNEL_DOMAIN?: string } = { TUNNEL_DOMAIN: "ws://localhost:8787" }
  ) {
    this.env = env;
  }

  createWebSocket() {
    const PROXY_WS_URL: string | null = `${this.env.TUNNEL_DOMAIN}/ws`;
    const wsUrl = new URL(PROXY_WS_URL);

    if (this.clientId) {
      wsUrl.searchParams.append("clientId", this.clientId);
    }

    const ws = new WebSocket(wsUrl.toString());
    this.handleWebsocket(ws);
  }

  reconnect() {
    this.backoffDelay = Math.min(this.backoffDelay * 2, 60000);
    this.isRetry = true;

    setTimeout(() => {
      this.createWebSocket();
    }, this.backoffDelay);
  }

  handleWebsocket(ws: WebSocket) {
    let domain =
      this.env.TUNNEL_DOMAIN?.replace(/^https?:\/\//, "")
        .replace(/^wss?:\/\//, "")
        .replace(/\/ws$/, "")
        .replace(/:\d+$/, "") || "localhost";

    let requestQueue: (() => void)[] = [];

    ws.onopen = () => {
      if (this.isRetry) {
        this.backoffDelay = 1000;
        return;
      }

      console.log(
        `${colors.green} ✓ Connected to proxy, proxying to localhost:${port}${colors.reset}`
      );
    };

    const processRequest = async (req: RequestMessage) => {
      try {
        const url = new URL(req.url);
        const targetUrl = `http://localhost:${port}${url.pathname}${url.search}`;
        // console.log(`${colors.gray}📡 Request: ${targetUrl}${colors.reset}`)
        const res = await fetch(targetUrl, {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });
        const statusColor =
          res.status >= 200 && res.status < 300
            ? "green"
            : res.status >= 400
            ? "red"
            : "yellow";
        console.log(
          `${colors.cyan}[${req.method}] ${colors[statusColor]}${res.status}${colors.reset} ${colors.gray}[${url.pathname}${url.search}]${colors.reset}`
        );
        const contentType = res.headers.get("content-type") || "";
        let body: { type: "text" | "binary"; data: string };

        if (req.headers.Upgrade) {
          // Reject unsupported upgrades, including WebSockets
          const responseData: ResponseMessage = {
            type: "response",
            id: req.id,
            status: 501,
            headers: {},
            body: { type: "text", data: "Protocol not supported" },
          };
          ws.send(JSON.stringify(responseData));
          return;
        }

        if (
          contentType.startsWith("text/") ||
          contentType.includes("json") ||
          contentType.includes("javascript") ||
          contentType.includes("xml")
        ) {
          body = { type: "text", data: await res.text() };
        } else {
          const buffer = await res.arrayBuffer();
          body = {
            type: "binary",
            data: Buffer.from(buffer).toString("base64"),
          };
        }
        const responseData: ResponseMessage = {
          type: "response",
          id: req.id,
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body,
        };
        ws.send(JSON.stringify(responseData));
      } catch {}
    };

    ws.onmessage = async (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        if (data.type === "request") {
          const req = data as RequestMessage;
          if (this.activeRequests < this.maxConcurrent) {
            processRequest(req);
          } else {
            requestQueue.push(() => processRequest(req));
          }
        } else if (data.type === "tunnel") {
          const tunnel = data as TunnelMessage;
          const host = new URL(tunnel.url).host;
          const subdomainMatch = host.match(
            new RegExp(`^([a-z0-9]+)\\.${domain.replace(/\./g, "\\.")}`)
          );

          if (subdomainMatch) {
            this.clientId = subdomainMatch[1] ?? "";
          }

          if (!this.isRetry) {
            console.log(
              `${colors.yellow}🌐 Tunnel established: ${tunnel.url}${colors.reset}`
            );
          }
        } else if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (e) {
        console.error(
          `${colors.red} Error handling request:${colors.reset}`,
          e
        );
        // Send error response
        const responseData: ResponseMessage = {
          type: "response",
          id: "unknown",
          status: 500,
          headers: {},
          body: { type: "text", data: "Internal error" },
        };
        ws.send(JSON.stringify(responseData));
      }
    };

    ws.onclose = (event) => {
      if (!event.wasClean) {
        this.reconnect();
        return;
      }
      // this.createWebSocket();
      console.log(`${colors.yellow} Disconnected from proxy${colors.reset}`);
    };

    ws.onerror = (error) => {
      this.reconnect();
      console.error(`${colors.red} WebSocket error:${colors.reset}`, error);
    };
  }
}

// 'https://onlocal.dev/ws'

let tunnel = new tunnelClient({ TUNNEL_DOMAIN: "wss://onlocal.dev" });
tunnel.createWebSocket();
// { TUNNEL_DOMAIN: "wss://onlocal.dev" }
