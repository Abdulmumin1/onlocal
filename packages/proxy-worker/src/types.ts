export interface WSMessage {
  type: 'request' | 'response' | 'port' | 'tunnel';
}

export interface RequestMessage extends WSMessage {
  type: 'request';
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ResponseMessage extends WSMessage {
  type: 'response';
  id: string;
  status: number;
  headers: Record<string, string>;
  body: { type: 'text' | 'binary'; data: string };
}

export interface PortMessage extends WSMessage {
  type: 'port';
  port: number;
}

export interface TunnelMessage extends WSMessage {
  type: 'tunnel';
  url: string;
}