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

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

const port = parseInt(process.argv[2] as string);
if (!port || isNaN(port)) {
  console.log(`${colors.cyan}Usage: bun index.ts <port>${colors.reset}`);
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
  console.log(`${colors.green}✓ Connected to proxy, proxying to localhost:${port}${colors.reset}`);
};

const processRequest = async (req: RequestMessage) => {
  activeRequests++;
  try {
    const url = new URL(req.url);
    const targetUrl = `http://localhost:${port}${url.pathname}${url.search}`;
    // console.log(`${colors.gray}📡 Request: ${targetUrl}${colors.reset}`)
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const statusColor = res.status >= 200 && res.status < 300 ? "green" : res.status >= 400 ? "red" : "yellow";
    console.log(`${colors.cyan}[${req.method}] ${colors[statusColor]}${res.status}${colors.reset} ${colors.gray}[${url.pathname}${url.search}]${colors.reset}`);
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
       console.log(`${colors.yellow}🌐 Tunnel established: ${tunnel.url}${colors.reset}`);
     } else if (data.type === 'ping') {
       ws.send(JSON.stringify({ type: 'pong' }));
     }
   } catch (e) {
      console.error(`${colors.red} Error handling request:${colors.reset}`, e);
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
  console.log(`${colors.yellow} Disconnected from proxy${colors.reset}`);
};

ws.onerror = (error) => {
  console.error(`${colors.red} WebSocket error:${colors.reset}`, error);
};
