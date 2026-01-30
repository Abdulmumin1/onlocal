export interface WSMessage {
  type: "request" | "response" | "port" | "tunnel" | "ping" | "pong" | "ws_open" | "ws_frame" | "ws_close";
}

export interface RequestMessage extends WSMessage {
  type: "request";
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ResponseMessage extends WSMessage {
  type: "response";
  id: string;
  status: number;
  headers: Record<string, string>;
  body: { type: "text" | "binary"; data: string };
}

export interface PortMessage extends WSMessage {
  type: "port";
  port: number;
}

export interface TunnelMessage extends WSMessage {
  type: "tunnel";
  url: string;
}

export interface WsOpenMessage extends WSMessage {
  type: "ws_open";
  streamId: string;
  url: string;
  headers: Record<string, string>;
}

export interface WsFrameMessage extends WSMessage {
  type: "ws_frame";
  streamId: string;
  data: string;
  isBinary: boolean;
}

export interface WsCloseMessage extends WSMessage {
  type: "ws_close";
  streamId: string;
  code?: number;
  reason?: string;
}
