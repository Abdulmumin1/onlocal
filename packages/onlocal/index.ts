#!/usr/bin/env node

interface WSMessage {
  type: "request" | "response" | "port" | "tunnel" | "ping" | "pong" | "ws_open" | "ws_frame" | "ws_close";
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

// WebSocket passthrough messages
interface WsOpenMessage extends WSMessage {
  type: "ws_open";
  streamId: string;
  url: string;
  headers: Record<string, string>;
}

interface WsFrameMessage extends WSMessage {
  type: "ws_frame";
  streamId: string;
  data: string;
  isBinary: boolean;
}

interface WsCloseMessage extends WSMessage {
  type: "ws_close";
  streamId: string;
  code?: number;
  reason?: string;
}

const colors = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function showHelp() {
  console.log(`
${colors.bold}${colors.cyan}  ┌─────────────────────────────────────┐
  │            onlocal                  │
  │   Expose localhost to the internet  │
  └─────────────────────────────────────┘${colors.reset}

${colors.bold}USAGE${colors.reset}
  ${colors.dim}$${colors.reset} onlocal ${colors.yellow}<port>${colors.reset}

${colors.bold}ARGUMENTS${colors.reset}
  ${colors.yellow}<port>${colors.reset}    Local port to expose ${colors.dim}(required)${colors.reset}

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 3000        ${colors.dim}# Expose localhost:3000${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 8080        ${colors.dim}# Expose localhost:8080${colors.reset}

${colors.bold}MORE INFO${colors.reset}
  ${colors.dim}https://onlocal.dev${colors.reset}
`);
}

const arg = process.argv[2];

if (arg === "-h" || arg === "--help") {
  showHelp();
  process.exit(0);
}

const port = parseInt(arg as string);
if (!port || isNaN(port)) {
  showHelp();
  process.exit(1);
}

class tunnelClient {
  clientId: string = "";
  env: { TUNNEL_DOMAIN?: string };
  maxConcurrent = 20;
  activeRequests: number = 0;
  backoffDelay: number = 1000;
  isRetry: boolean = false;
  // Track local WebSocket connections for passthrough (streamId -> WebSocket)
  localWsSockets: Map<string, WebSocket> = new Map();

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
        } else if (data.type === "ws_open") {
          // Open WebSocket to localhost
          const wsOpen = data as WsOpenMessage;
          this.handleWsOpen(wsOpen, ws);
        } else if (data.type === "ws_frame") {
          // Forward frame to local WebSocket
          const wsFrame = data as WsFrameMessage;
          this.handleWsFrame(wsFrame);
        } else if (data.type === "ws_close") {
          // Close local WebSocket
          const wsClose = data as WsCloseMessage;
          this.handleWsClose(wsClose);
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
      // Close all local WebSockets
      for (const [streamId, localWs] of this.localWsSockets) {
        try {
          localWs.close(1001, "Tunnel disconnected");
        } catch (e) {
          // Ignore
        }
      }
      this.localWsSockets.clear();

      if (!event.wasClean) {
        this.reconnect();
        return;
      }
      console.log(`${colors.yellow} Disconnected from proxy${colors.reset}`);
    };

    ws.onerror = (error) => {
      this.reconnect();
      console.error(`${colors.red} WebSocket error:${colors.reset}`, error);
    };
  }

  // Handle ws_open: open WebSocket to localhost
  handleWsOpen(msg: WsOpenMessage, controlWs: WebSocket) {
    const url = new URL(msg.url);
    const wsUrl = `ws://localhost:${port}${url.pathname}${url.search}`;

    console.log(
      `${colors.cyan}[WS] ${colors.green}OPEN${colors.reset} ${colors.gray}[${url.pathname}]${colors.reset}`
    );

    try {
      const localWs = new WebSocket(wsUrl);

      localWs.onopen = () => {
        this.localWsSockets.set(msg.streamId, localWs);
        console.log(
          `${colors.cyan}[WS] ${colors.green}CONNECTED${colors.reset} ${colors.gray}[streamId: ${msg.streamId}]${colors.reset}`
        );
      };

      localWs.onmessage = (event) => {
        // Forward message to proxy
        let wsFrameMessage: WsFrameMessage;

        if (event.data instanceof ArrayBuffer) {
          // Binary message
          const bytes = new Uint8Array(event.data);
          wsFrameMessage = {
            type: "ws_frame",
            streamId: msg.streamId,
            data: Buffer.from(bytes).toString("base64"),
            isBinary: true,
          };
        } else if (event.data instanceof Blob) {
          // Handle Blob asynchronously
          event.data.arrayBuffer().then((buffer) => {
            const blobFrameMessage: WsFrameMessage = {
              type: "ws_frame",
              streamId: msg.streamId,
              data: Buffer.from(buffer).toString("base64"),
              isBinary: true,
            };
            controlWs.send(JSON.stringify(blobFrameMessage));
          });
          return;
        } else {
          // Text message
          wsFrameMessage = {
            type: "ws_frame",
            streamId: msg.streamId,
            data: event.data,
            isBinary: false,
          };
        }

        controlWs.send(JSON.stringify(wsFrameMessage));
      };

      localWs.onclose = (event) => {
        console.log(
          `${colors.cyan}[WS] ${colors.yellow}CLOSED${colors.reset} ${colors.gray}[streamId: ${msg.streamId}]${colors.reset}`
        );
        this.localWsSockets.delete(msg.streamId);

        // Notify proxy
        const wsCloseMessage: WsCloseMessage = {
          type: "ws_close",
          streamId: msg.streamId,
          code: event.code,
          reason: event.reason,
        };
        controlWs.send(JSON.stringify(wsCloseMessage));
      };

      localWs.onerror = (error) => {
        console.error(
          `${colors.red}[WS] Error for streamId ${msg.streamId}:${colors.reset}`,
          error
        );
        this.localWsSockets.delete(msg.streamId);

        // Notify proxy of close
        const wsCloseMessage: WsCloseMessage = {
          type: "ws_close",
          streamId: msg.streamId,
          code: 1011,
          reason: "Local WebSocket error",
        };
        controlWs.send(JSON.stringify(wsCloseMessage));
      };
    } catch (e) {
      console.error(
        `${colors.red}[WS] Failed to connect to localhost:${port}${colors.reset}`,
        e
      );
      // Notify proxy of failure
      const wsCloseMessage: WsCloseMessage = {
        type: "ws_close",
        streamId: msg.streamId,
        code: 1011,
        reason: "Failed to connect to local server",
      };
      controlWs.send(JSON.stringify(wsCloseMessage));
    }
  }

  // Handle ws_frame: forward frame to local WebSocket
  handleWsFrame(msg: WsFrameMessage) {
    const localWs = this.localWsSockets.get(msg.streamId);
    if (!localWs) {
      console.log(
        `${colors.yellow}[WS] No local socket for streamId: ${msg.streamId}${colors.reset}`
      );
      return;
    }

    if (msg.isBinary) {
      // Decode base64 to binary
      const buffer = Buffer.from(msg.data, "base64");
      localWs.send(buffer);
    } else {
      localWs.send(msg.data);
    }
  }

  // Handle ws_close: close local WebSocket
  handleWsClose(msg: WsCloseMessage) {
    const localWs = this.localWsSockets.get(msg.streamId);
    if (localWs) {
      localWs.close(msg.code || 1000, msg.reason || "");
      this.localWsSockets.delete(msg.streamId);
      console.log(
        `${colors.cyan}[WS] ${colors.yellow}CLOSED${colors.reset} ${colors.gray}[streamId: ${msg.streamId}]${colors.reset}`
      );
    }
  }
}

// 'https://onlocal.dev/ws'

const tunnelDomain = process.env.TUNNEL_DOMAIN || "wss://in.onlocal.dev";
let tunnel = new tunnelClient({ TUNNEL_DOMAIN: tunnelDomain });
tunnel.createWebSocket();
