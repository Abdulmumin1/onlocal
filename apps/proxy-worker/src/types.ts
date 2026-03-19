export interface WSMessage {
  type:
    | 'request'
    | 'response'
    | 'response_start'
    | 'response_chunk'
    | 'response_end'
    | 'port'
    | 'tunnel'
    | 'ping'
    | 'pong';
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

export interface ResponseStartMessage extends WSMessage {
  type: 'response_start';
  id: string;
  status: number;
  headers: Record<string, string>;
  bodyType: 'text' | 'binary';
}

export interface ResponseChunkMessage extends WSMessage {
  type: 'response_chunk';
  id: string;
  data: string;
}

export interface ResponseEndMessage extends WSMessage {
  type: 'response_end';
  id: string;
}

export interface PortMessage extends WSMessage {
  type: 'port';
  port: number;
}

export interface TunnelMessage extends WSMessage {
  type: 'tunnel';
  url: string;
}
