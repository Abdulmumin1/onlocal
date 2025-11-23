#!/usr/bin/env node

interface WSMessage {
  type: 'request' | 'response' | 'port' | 'tunnel' | 'ping' | 'pong';
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
  console.log(`${Bun.color("cyan", "ansi")}Usage: bun index.ts <port>\x1b[0m`);
  process.exit(1);
}
// 'https://onlocal.dev/ws'

const PROXY_WS_URL: string | null =  "https://onlocal.dev/ws";

const wsUrl = PROXY_WS_URL || 'ws://localhost:8787/ws';
const ws = new WebSocket(wsUrl);

let activeRequests = 0;
const maxConcurrent = 20;
let requestQueue: (() => void)[] = [];

ws.onopen = () => {
  console.log(`${Bun.color("green", "ansi")}✓ Connected to proxy, proxying to localhost:${port}\x1b[0m`);
};

const processRequest = async (req: RequestMessage) => {
  activeRequests++;
  try {
    const url = new URL(req.url);
    const targetUrl = `${url.protocol}//localhost:${port}${url.pathname}${url.search}`;
    // console.log(`${Bun.color("gray", "ansi")}📡 Request: ${targetUrl}\x1b[0m`)
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const statusColor = res.status >= 200 && res.status < 300 ? "green" : res.status >= 400 ? "red" : "yellow";
    console.log(`${Bun.color("cyan", "ansi")}[${req.method}] ${Bun.color(statusColor, "ansi")}${res.status}\x1b[0m ${Bun.color("gray", "ansi")}[${url.pathname}${url.search}]\x1b[0m`);
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
  } finally {
    activeRequests--;
    if (requestQueue.length > 0) {
      const next = requestQueue.shift()!;
      next();
    }
  }
};

ws.onmessage = async (event) => {
  try {
    const data: WSMessage = JSON.parse(event.data);
    if (data.type === 'request') {
      const req = data as RequestMessage;
      if (activeRequests < maxConcurrent) {
        processRequest(req);
      } else {
        requestQueue.push(() => processRequest(req));
      }
     } else if (data.type === 'tunnel') {
       const tunnel = data as TunnelMessage;
       console.log(`${Bun.color("yellow", "ansi")}🌐 Tunnel established: ${tunnel.url}\x1b[0m`);
     } else if (data.type === 'ping') {
       ws.send(JSON.stringify({ type: 'pong' }));
     }
   } catch (e) {
     console.error(`${Bun.color("red", "ansi")} Error handling request:\x1b[0m`, e);
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
  console.log(`${Bun.color("yellow", "ansi")} Disconnected from proxy\x1b[0m`);
};

ws.onerror = (error) => {
  console.error(`${Bun.color("red", "ansi")} WebSocket error:\x1b[0m`, error);
};
