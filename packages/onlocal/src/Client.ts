import { colors } from "./utils";
import * as readline from "readline";
import { renderSessionStatus, renderTunnelSummary, type SessionStatus } from "./ui";
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
  verbosity?: LogVerbosity;
}

export type LogVerbosity = "silent" | "normal" | "verbose";
type LogLevel = "always" | "normal" | "verbose";

export class TunnelClient {
  static readonly MAX_TEXT_CHUNK_CHARS = 48 * 1024;
  static readonly MIN_TEXT_CHUNK_CHARS = 1024;
  static readonly MAX_BINARY_CHUNK_BYTES = 24 * 1024;
  static readonly SOCKET_CONNECT_TIMEOUT_MS = 10000;

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
  connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  sendQueue: Promise<void> = Promise.resolve();
  verbosity: LogVerbosity;
  sessionStatus: SessionStatus = "connecting";
  tunnelUrl: string | null = null;
  hasShownTunnel: boolean = false;

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
    this.verbosity = options.verbosity || "normal";
  }

  shouldLog(level: LogLevel = "normal"): boolean {
    if (level === "always") {
      return true;
    }

    if (this.verbosity === "silent") {
      return false;
    }

    if (level === "verbose") {
      return this.verbosity === "verbose";
    }

    return true;
  }

  writeLine(message: string, level: LogLevel = "normal") {
    if (!this.shouldLog(level)) {
      return;
    }

    if (!process.stdout.isTTY || !this.hasShownTunnel) {
      console.log(message);
      return;
    }

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${message}\n`);
    this.renderSessionStatusLine();
  }

  formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  writeVerboseError(prefix: string, error: unknown) {
    this.writeLine(
      `${colors.red}${prefix}:${colors.reset} ${this.formatError(error)}`,
      "verbose"
    );
  }

  renderSessionStatusLine() {
    if (!this.hasShownTunnel) {
      return;
    }

    const statusLine = renderSessionStatus(this.sessionStatus);

    if (!process.stdout.isTTY) {
      console.log(statusLine);
      return;
    }

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(statusLine);
  }

  setSessionStatus(status: SessionStatus) {
    if (this.sessionStatus === status) {
      return;
    }

    this.sessionStatus = status;
    this.renderSessionStatusLine();
  }

  renderTunnel(url: string) {
    const hasUrlChanged = this.tunnelUrl !== url;
    this.tunnelUrl = url;

    if (!this.hasShownTunnel || hasUrlChanged) {
      this.hasShownTunnel = true;
      this.writeLine(
        renderTunnelSummary(url, this.port),
        "always"
      );
    }

    this.renderSessionStatusLine();
  }

  finishStatusLine() {
    if (process.stdout.isTTY && this.hasShownTunnel) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  clearConnectTimeoutTimer() {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  startConnectTimeout(ws: WebSocket) {
    this.clearConnectTimeoutTimer();
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.ws !== ws || ws.readyState !== WebSocket.CONNECTING) {
        return;
      }

      this.writeLine(
        `${colors.dim}Socket connect timed out${colors.reset}`,
        "verbose"
      );
      try {
        ws.close();
      } catch {}
      this.ws = null;
      this.reconnect();
    }, TunnelClient.SOCKET_CONNECT_TIMEOUT_MS);
  }

  start() {
    this.isStopping = false;
    this.sessionStatus = "connecting";
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
    this.setSessionStatus("offline");
    this.clearReconnectTimer();
    this.clearConnectTimeoutTimer();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "Client shutting down");
    }

    try {
      await this.releaseClientId();
    } catch (error) {
      this.writeVerboseError("Failed to release client ID", error);
    }

    this.finishStatusLine();
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
    this.setSessionStatus(this.hasShownTunnel ? "reconnecting" : "connecting");
    this.startConnectTimeout(ws);
    this.handleWebsocket(ws);
  }

  reconnect() {
    if (this.forcingReconnect || this.isStopping) return;
    if (this.reconnectTimer) return;

    this.isRetry = true;
    this.setSessionStatus("reconnecting");
    const reconnectDelay = this.backoffDelay;
    this.backoffDelay = Math.min(this.backoffDelay * 2, 60000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createWebSocket();
    }, reconnectDelay);
  }

  forceReconnect() {
    this.setSessionStatus("reconnecting");
    this.forcingReconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    } else {
      this.forcingReconnect = false;
      this.createWebSocket();
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

      if (this.reconnectTimer) {
        this.clearReconnectTimer();
      }

      this.clearConnectTimeoutTimer();
      this.setSessionStatus("online");

      if (this.isRetry) {
        this.backoffDelay = 1000;
        this.isRetry = false;
      }
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
        this.writeLine(
          `${methodColor}[${req.method}]${colors.reset} ${colors[statusColor as keyof typeof colors]}${res.status}${colors.reset} ${colors.gray}${url.pathname}${url.search}${colors.reset}`
        );
        await this.sendStreamedResponse(req, res, sendControlMessage);
      } catch (error) {
        this.writeLine(
          `${colors.red}Failed to proxy request:${colors.reset} ${req.method} ${req.url}`,
          "always"
        );
        this.writeVerboseError("Proxy failure details", error);

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

          this.renderTunnel(tunnel.url);
        } else if (data.type === "ping") {
          await sendControlMessage({ type: "pong" });
        }
      } catch (e) {
        this.writeVerboseError("Error handling websocket message", e);
        const responseData: ResponseMessage = {
          type: "response",
          id: "unknown",
          status: 500,
          headers: {},
          body: { type: "text", data: "Internal error" },
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(responseData));
        }
      }
    };

    ws.onclose = (event) => {
      if (!isCurrentSocket()) {
        return;
      }
      this.isRetry = true;

      this.clearConnectTimeoutTimer();
      this.ws = null;
      this.sendQueue = Promise.resolve();
      this.setSessionStatus("reconnecting");

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
        this.setSessionStatus("offline");
        return;
      }

      this.writeLine(
        `${colors.dim}Socket closed${colors.reset} ${colors.gray}code=${event.code} clean=${event.wasClean}${colors.reset}`,
        "verbose"
      );
      this.reconnect();
    };

    ws.onerror = (error) => {
      if (!isCurrentSocket()) {
        return;
      }

      if (this.isStopping) {
        return;
      }

      this.setSessionStatus("reconnecting");
      this.writeVerboseError("WebSocket error", error);
    };
  }
}
