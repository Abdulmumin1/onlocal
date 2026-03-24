import { colors } from "./utils";
import { renderLogo, renderBox } from "./ui";
import type {
  WSMessage,
  RequestMessage,
  ResponseMessage,
  ResponseStartMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  TunnelMessage,
} from "./types";

export interface TunnelOptions {
  port: number;
  domain?: string;
  clientId?: string;
}

export class TunnelClient {
  static readonly MAX_TEXT_CHUNK_CHARS = 48 * 1024;
  static readonly MIN_TEXT_CHUNK_CHARS = 1024;
  static readonly MAX_BINARY_CHUNK_BYTES = 24 * 1024;

  clientId: string = "";
  requestedClientId?: string;
  reconnectToken: string;
  domain: string;
  port: number;
  maxConcurrent = 6;
  activeRequests: number = 0;
  backoffDelay: number = 1000;
  isRetry: boolean = false;
  ws: WebSocket | null = null;
  forcingReconnect: boolean = false;
  isStopping: boolean = false;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  sendQueue: Promise<void> = Promise.resolve();

  sanitizeRequestHeaders(headers: Record<string, string>): Record<string, string> {
    const nextHeaders = { ...headers };

    delete nextHeaders.connection;
    delete nextHeaders["keep-alive"];
    delete nextHeaders["proxy-connection"];
    delete nextHeaders["transfer-encoding"];
    delete nextHeaders.upgrade;
    delete nextHeaders["content-length"];
    delete nextHeaders["sec-websocket-key"];
    delete nextHeaders["sec-websocket-version"];
    delete nextHeaders["sec-websocket-protocol"];
    delete nextHeaders["sec-websocket-extensions"];

    if (headers.host) {
      nextHeaders["x-forwarded-host"] = headers.host;
    }

    return nextHeaders;
  }

  sanitizeResponseHeaders(headers: Record<string, string>): Record<string, string> {
    const nextHeaders = { ...headers };

    delete nextHeaders.connection;
    delete nextHeaders["keep-alive"];
    delete nextHeaders["proxy-connection"];
    delete nextHeaders["transfer-encoding"];
    delete nextHeaders.upgrade;
    delete nextHeaders["content-length"];
    delete nextHeaders["content-encoding"];

    return nextHeaders;
  }

  isTextResponse(contentType: string): boolean {
    return (
      contentType.startsWith("text/") ||
      contentType.includes("json") ||
      contentType.includes("javascript") ||
      contentType.includes("xml")
    );
  }

  isNullBodyStatus(status: number): boolean {
    return status === 204 || status === 205 || status === 304;
  }

  async sendResponseStart(
    reqId: string,
    status: number,
    headers: Record<string, string>,
    bodyType: "text" | "binary",
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    const responseStart: ResponseStartMessage = {
      type: "response_start",
      id: reqId,
      status,
      headers,
      bodyType,
    };

    await sendControlMessage(responseStart);
  }

  async sendResponseEnd(
    reqId: string,
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    const responseEnd: ResponseEndMessage = {
      type: "response_end",
      id: reqId,
    };

    await sendControlMessage(responseEnd);
  }

  async sendTextChunks(
    reqId: string,
    data: string,
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    let remaining = data;

    while (remaining.length > 0) {
      let chunkLength = Math.min(
        remaining.length,
        TunnelClient.MAX_TEXT_CHUNK_CHARS
      );
      let chunk = remaining.slice(0, chunkLength);

      while (
        chunk.length > TunnelClient.MIN_TEXT_CHUNK_CHARS &&
        JSON.stringify({
          type: "response_chunk",
          id: reqId,
          data: chunk,
        } satisfies ResponseChunkMessage).length >
          TunnelClient.MAX_TEXT_CHUNK_CHARS
      ) {
        chunkLength = Math.max(
          TunnelClient.MIN_TEXT_CHUNK_CHARS,
          Math.floor(chunkLength * 0.75)
        );
        chunk = remaining.slice(0, chunkLength);
      }

      const responseChunk: ResponseChunkMessage = {
        type: "response_chunk",
        id: reqId,
        data: chunk,
      };

      await sendControlMessage(responseChunk);
      remaining = remaining.slice(chunk.length);
    }
  }

  async sendBinaryChunks(
    reqId: string,
    body: ReadableStream<Uint8Array>,
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        for (
          let offset = 0;
          offset < value.length;
          offset += TunnelClient.MAX_BINARY_CHUNK_BYTES
        ) {
          const slice = value.subarray(
            offset,
            Math.min(offset + TunnelClient.MAX_BINARY_CHUNK_BYTES, value.length)
          );
          const responseChunk: ResponseChunkMessage = {
            type: "response_chunk",
            id: reqId,
            data: Buffer.from(slice).toString("base64"),
          };

          await sendControlMessage(responseChunk);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async sendTextStream(
    reqId: string,
    body: ReadableStream<Uint8Array>,
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let bufferedText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        bufferedText += decoder.decode(value, { stream: true });

        while (bufferedText.length >= TunnelClient.MIN_TEXT_CHUNK_CHARS) {
          const nextChunk = bufferedText.slice(
            0,
            TunnelClient.MAX_TEXT_CHUNK_CHARS
          );

          await this.sendTextChunks(reqId, nextChunk, sendControlMessage);
          bufferedText = bufferedText.slice(nextChunk.length);
        }
      }

      bufferedText += decoder.decode();
      if (bufferedText.length > 0) {
        await this.sendTextChunks(reqId, bufferedText, sendControlMessage);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async sendStreamedResponse(
    req: RequestMessage,
    res: Response,
    sendControlMessage: (payload: WSMessage) => Promise<void>
  ) {
    const headers = this.sanitizeResponseHeaders(
      Object.fromEntries(res.headers.entries())
    );
    const contentType = res.headers.get("content-type") || "";
    const bodyType = this.isTextResponse(contentType) ? "text" : "binary";
    const shouldSendBody =
      req.method !== "HEAD" && !this.isNullBodyStatus(res.status);

    await this.sendResponseStart(
      req.id,
      res.status,
      headers,
      bodyType,
      sendControlMessage
    );

    if (!shouldSendBody) {
      return;
    }

    if (res.body) {
      if (bodyType === "text") {
        await this.sendTextStream(req.id, res.body, sendControlMessage);
      } else {
        await this.sendBinaryChunks(req.id, res.body, sendControlMessage);
      }
    }

    await this.sendResponseEnd(req.id, sendControlMessage);
  }

  constructor(options: TunnelOptions) {
    this.port = options.port;
    this.domain = options.domain || "wss://onlocal.dev";
    this.requestedClientId = options.clientId;
    this.reconnectToken = crypto.randomUUID();
  }

  start() {
    this.isStopping = false;
    this.createWebSocket();
  }

  getHttpBaseUrl(): string {
    return this.domain
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://")
      .replace(/\/+$/, "");
  }

  getActiveClientId(): string | null {
    return this.requestedClientId || this.clientId || null;
  }

  async releaseClientId() {
    const clientId = this.getActiveClientId();
    if (!clientId) {
      return;
    }

    await fetch(
      `${this.getHttpBaseUrl()}/client-id/${encodeURIComponent(clientId)}/release`,
      {
        method: "DELETE",
        headers: {
          "X-Reconnect-Token": this.reconnectToken,
        },
      }
    );
  }

  async shutdown() {
    this.isStopping = true;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "Client shutting down");
    }

    try {
      await this.releaseClientId();
    } catch (error) {
      console.error(`${colors.red} Failed to release client ID:${colors.reset}`, error);
    }
  }

  createWebSocket() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const PROXY_WS_URL: string = `${this.domain}/ws`;
    const wsUrl = new URL(PROXY_WS_URL);
    const requestedClientId = this.requestedClientId || this.clientId;
    const connectionId = crypto.randomUUID();

    if (requestedClientId) {
      wsUrl.searchParams.append("clientId", requestedClientId);
    }
    wsUrl.searchParams.append("token", this.reconnectToken);
    wsUrl.searchParams.append("connectionId", connectionId);

    const ws = new WebSocket(wsUrl.toString());
    this.ws = ws;
    this.sendQueue = Promise.resolve();
    this.handleWebsocket(ws);
  }

  reconnect() {
    if (this.forcingReconnect || this.isStopping) return;
    if (this.reconnectTimer) return;

    this.backoffDelay = Math.min(this.backoffDelay * 2, 60000);
    this.isRetry = true;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createWebSocket();
    }, this.backoffDelay);
  }

  forceReconnect() {
    console.log(`${colors.yellow}⟳ Force reconnecting...${colors.reset}`);
    this.forcingReconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      console.log(`${colors.yellow}⟳ Reconnected...${colors.reset}`);
    } else {
      this.forcingReconnect = false;
      this.createWebSocket();
      console.log(`${colors.yellow}◌ Reconnected${colors.reset}`);

    }
  }

  handleWebsocket(ws: WebSocket) {
    const isCurrentSocket = () => this.ws === ws;

    let domain =
      this.domain
        .replace(/^https?:\/\//, "")
        .replace(/^wss?:\/\//, "")
        .replace(/\/ws$/, "")
        .replace(/:\d+$/, "") || "localhost";

    let requestQueue: (() => void)[] = [];
    const runNextQueuedRequest = () => {
      if (this.activeRequests >= this.maxConcurrent) {
        return;
      }

      const nextRequest = requestQueue.shift();
      if (nextRequest) {
        nextRequest();
      }
    };

    const sendControlMessage = async (payload: WSMessage) => {
      const serialized = JSON.stringify(payload);

      this.sendQueue = this.sendQueue
        .catch(() => {})
        .then(async () => {
          while (
            isCurrentSocket() &&
            ws.readyState === WebSocket.OPEN &&
            ws.bufferedAmount > 512 * 1024
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          if (!isCurrentSocket() || ws.readyState !== WebSocket.OPEN) {
            throw new Error("Control websocket is not open");
          }

          ws.send(serialized);
        });

      return this.sendQueue;
    };

    ws.onopen = () => {
      if (!isCurrentSocket()) {
        try {
          ws.close();
        } catch {}
        return;
      }

      console.log(`${colors.dim}• Offline${colors.reset}`);


      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.isRetry) {
        this.backoffDelay = 1000;
        this.isRetry = false;
        return;
      }

      console.log(`${colors.yellow}✓${colors.reset} Connected to proxy, proxying to ${colors.bold}localhost:${this.port}${colors.reset}`);
    };

    const processRequest = async (req: RequestMessage) => {
      this.activeRequests++;

      try {
        const url = new URL(req.url);
        const targetUrl = `http://localhost:${this.port}${url.pathname}${url.search}`;
        const res = await fetch(targetUrl, {
          method: req.method,
          headers: this.sanitizeRequestHeaders(req.headers),
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
        await this.sendStreamedResponse(req, res, sendControlMessage);
      } catch (error) {
        console.error(
          `${colors.red} Failed to proxy request:${colors.reset}`,
          req.method,
          req.url,
          error
        );

        const responseData: ResponseMessage = {
          type: "response",
          id: req.id,
          status: 502,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
          body: {
            type: "text",
            data: "Failed to reach local server",
          },
        };
        try {
          await sendControlMessage(responseData);
        } catch {}
      } finally {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        runNextQueuedRequest();
      }
    };

    ws.onmessage = async (event) => {
      if (!isCurrentSocket()) {
        return;
      }

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
              `${colors.bold}${colors.yellow}${tunnel.url}${colors.reset}`,
            ], "Press 'r' to force reconnect"));
          }
        } else if (data.type === "ping") {
          await sendControlMessage({ type: "pong" });
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
      if (!isCurrentSocket()) {
        return;
      }
      this.isRetry = true;

      this.ws = null;
      this.sendQueue = Promise.resolve();

      // console.error(
      //   `${colors.red} Control websocket closed:${colors.reset} code=${event.code} clean=${event.wasClean} reason=${event.reason || "n/a"} active=${this.activeRequests} queued=${requestQueue.length} buffered=${ws.bufferedAmount}`
      // );

      if (this.forcingReconnect) {
        this.forcingReconnect = false;
        this.isRetry = true;
        this.backoffDelay = 1000;
        this.createWebSocket();
        return;
      }

      if (this.isStopping) {
        return;
      }

      if (!event.wasClean) {
        this.reconnect();
        return;
      }
      console.log(`${colors.yellow} Disconnected from proxy${colors.reset}`);
    };

    ws.onerror = (error) => {
      if (!isCurrentSocket()) {
        return;
      }

      if (this.isStopping) {
        return;
      }

      console.error(`${colors.red} WebSocket error:${colors.reset}`, error);
    };
  }
}
