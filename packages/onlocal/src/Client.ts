import { colors } from "./utils";
import { renderLogo, renderBox } from "./ui";
import type {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  TunnelMessage,
  WsOpenMessage,
  WsFrameMessage,
  WsCloseMessage,
} from "./types";

export interface TunnelOptions {
  port: number;
  domain?: string;
}

export class TunnelClient {
  clientId: string = "";
  domain: string;
  port: number;
  maxConcurrent = 20;
  activeRequests: number = 0;
  backoffDelay: number = 1000;
  isRetry: boolean = false;
  ws: WebSocket | null = null;
  forcingReconnect: boolean = false;
  localWsSockets: Map<string, WebSocket> = new Map();

  constructor(options: TunnelOptions) {
    this.port = options.port;
    this.domain = options.domain || "wss://onlocal.dev";
  }

  start() {
    this.createWebSocket();
  }

  createWebSocket() {
    const PROXY_WS_URL: string = `${this.domain}/ws`;
    const wsUrl = new URL(PROXY_WS_URL);

    if (this.clientId) {
      wsUrl.searchParams.append("clientId", this.clientId);
    }

    const ws = new WebSocket(wsUrl.toString());
    this.ws = ws;
    this.handleWebsocket(ws);
  }

  reconnect() {
    if (this.forcingReconnect) return;
    this.backoffDelay = Math.min(this.backoffDelay * 2, 60000);
    this.isRetry = true;

    setTimeout(() => {
      this.createWebSocket();
    }, this.backoffDelay);
  }

  forceReconnect() {
    console.log(`${colors.yellow}⟳ Force reconnecting...${colors.reset}`);
    this.forcingReconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    } else {
      this.forcingReconnect = false;
      this.createWebSocket();
    }
  }

  handleWebsocket(ws: WebSocket) {
    let domain =
      this.domain
        .replace(/^https?:\/\//, "")
        .replace(/^wss?:\/\//, "")
        .replace(/\/ws$/, "")
        .replace(/:\d+$/, "") || "localhost";

    let requestQueue: (() => void)[] = [];

    ws.onopen = () => {
      if (this.isRetry) {
        this.backoffDelay = 1000;
        return;
      }

      console.log(`${colors.green}✓${colors.reset} Connected to proxy, proxying to ${colors.bold}localhost:${this.port}${colors.reset}`);
    };

    const processRequest = async (req: RequestMessage) => {
      try {
        const url = new URL(req.url);
        const targetUrl = `http://localhost:${this.port}${url.pathname}${url.search}`;
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
            
        const methodColor = colors.cyan;
        
        // Log the request in a compact way
        console.log(
          `${methodColor}[${req.method}]${colors.reset} ${colors[statusColor as keyof typeof colors]}${res.status}${colors.reset} ${colors.gray}${url.pathname}${url.search}${colors.reset}`
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
        const data: WSMessage = JSON.parse(event.data as string);
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
            console.log(renderBox("Tunnel Established", [
              `${colors.green}Your URL is ready!`,
              ``,
              `${colors.bold}${tunnel.url}${colors.reset}`,
            ], "Press 'r' to force reconnect"));
          }
        } else if (data.type === "ws_open") {
          const wsOpen = data as WsOpenMessage;
          this.handleWsOpen(wsOpen, ws);
        } else if (data.type === "ws_frame") {
          const wsFrame = data as WsFrameMessage;
          this.handleWsFrame(wsFrame);
        } else if (data.type === "ws_close") {
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
      for (const [streamId, localWs] of this.localWsSockets) {
        try {
          localWs.close(1001, "Tunnel disconnected");
        } catch (e) {
          // Ignore
        }
      }
      this.localWsSockets.clear();

      if (this.forcingReconnect) {
        this.forcingReconnect = false;
        this.isRetry = true;
        this.backoffDelay = 1000;
        this.createWebSocket();
        return;
      }

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

  handleWsOpen(msg: WsOpenMessage, controlWs: WebSocket) {
    const url = new URL(msg.url);
    const wsUrl = `ws://localhost:${this.port}${url.pathname}${url.search}`;

    console.log(
      `${colors.cyan}[WS] ${colors.green}OPEN${colors.reset} ${colors.gray}${url.pathname}${colors.reset}`
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
        let wsFrameMessage: WsFrameMessage;

        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          wsFrameMessage = {
            type: "ws_frame",
            streamId: msg.streamId,
            data: Buffer.from(bytes).toString("base64"),
            isBinary: true,
          };
        } else if (event.data instanceof Blob) {
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
          wsFrameMessage = {
            type: "ws_frame",
            streamId: msg.streamId,
            data: event.data as string,
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
        `${colors.red}[WS] Failed to connect to localhost:${this.port}${colors.reset}`,
        e
      );
      const wsCloseMessage: WsCloseMessage = {
        type: "ws_close",
        streamId: msg.streamId,
        code: 1011,
        reason: "Failed to connect to local server",
      };
      controlWs.send(JSON.stringify(wsCloseMessage));
    }
  }

  handleWsFrame(msg: WsFrameMessage) {
    const localWs = this.localWsSockets.get(msg.streamId);
    if (!localWs) {
      console.log(
        `${colors.yellow}[WS] No local socket for streamId: ${msg.streamId}${colors.reset}`
      );
      return;
    }

    if (msg.isBinary) {
      const buffer = Buffer.from(msg.data, "base64");
      localWs.send(buffer);
    } else {
      localWs.send(msg.data);
    }
  }

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
