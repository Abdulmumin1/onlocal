#!/usr/bin/env bun

interface WSMessage {
  type: 'request' | 'response' | 'port' | 'tunnel';
}

interface RequestMessage extends WSMessage {
  type: 'request';
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

interface ResponseMessage extends WSMessage {
  type: 'response';
  id: string;
  status: number;
  headers: Record<string, string>;
  body: { type: 'text' | 'binary'; data: string };
}

interface PortMessage extends WSMessage {
  type: 'port';
  port: number;
}

interface TunnelMessage extends WSMessage {
  type: 'tunnel';
  url: string;
}

const port = parseInt(process.argv[2] as string);
if (!port || isNaN(port)) {
  console.error('Usage: bun index.ts <port>');
  process.exit(1);
}
const PROXY_WS_URL: string | null =  'https://onlocal.dev/ws'

const wsUrl = PROXY_WS_URL || 'ws://localhost:8787/ws';
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log(`Connected to proxy, proxying to localhost:${port}`);
};

ws.onmessage = async (event) => {
  try {
    const data: WSMessage = JSON.parse(event.data);
    if (data.type === 'request') {
      const req = data as RequestMessage;
      const url = new URL(req.url);
      const targetUrl = `http://localhost:${port}${url.pathname}${url.search}`;
      const res = await fetch(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      console.log(`[${req.method}] ${res.status} [${url.pathname}${url.search}] `);
      const contentType = res.headers.get('content-type') || '';
      let body: { type: 'text' | 'binary'; data: string };
      if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript') || contentType.includes('xml')) {
        body = { type: 'text', data: await res.text() };
      } else {
        const buffer = await res.arrayBuffer();
        body = { type: 'binary', data: Buffer.from(buffer).toString('base64') };
      }
      const responseData: ResponseMessage = {
        type: 'response',
        id: req.id,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      };
      ws.send(JSON.stringify(responseData));
    } else if (data.type === 'tunnel') {
      const tunnel = data as TunnelMessage;
      console.log(`Tunnel established: ${tunnel.url}`);
    }
  } catch (e) {
    console.error('Error handling request:', e);
    // Send error response
    const responseData: ResponseMessage = {
      type: 'response',
      id: 'unknown',
      status: 500,
      headers: {},
      body: { type: 'text', data: 'Internal error' },
    };
    ws.send(JSON.stringify(responseData));
  }
};

ws.onclose = () => {
  console.log('Disconnected from proxy');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
