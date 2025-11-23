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

const clients = new Map<string, { ws: Bun.ServerWebSocket; port?: number }>();
const pendingRequests = new Map<string, { resolve: (res: Response) => void; reject: (err: Error) => void }>();

function generateClientId(): string {
  return Math.random().toString(36).substr(2, 9);
}

Bun.serve({
  port: 8080,
  async fetch(req, server) {
    // Handle WebSocket upgrade
    if (server.upgrade(req)) {
      return;
    }

    // Handle HTTP requests
    const host = req.headers.get('host') || '';
    let clientId: string | null = null;

    // Check for subdomain (e.g., abc123.tunnel.example.com)
    const domain = process.env.TUNNEL_DOMAIN || 'localhost:8080';
    const isProduction = process.env.NODE_ENV === 'production';
    let subdomainMatch: RegExpMatchArray | null = null;
    if (isProduction) {
      subdomainMatch = host.match(new RegExp(`^([a-z0-9]+)\\.${domain.replace(/\./g, '\\.')}$`));
      if (subdomainMatch) {
        clientId = subdomainMatch?.[1] ?? null;
      }
    } else {
      // For local, check subdomain or path
      subdomainMatch = host.match(/^([a-z0-9]+)\.(.+)$/);
      if (subdomainMatch) {
        clientId = subdomainMatch?.[1] ?? null;
      } else {
        // Fallback to path for local testing (e.g., localhost:8080/abc123)
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(p => p);
        clientId = pathParts[0] || null;
      }
    }

    if (!clientId || !clients.has(clientId)) {
      return new Response("Tunnel not found", { status: 404 });
    }

    const client = clients.get(clientId)!;

    // Send request to client over WebSocket
    const reqId = Math.random().toString(36).substr(2, 9);
    let requestUrl = req.url;
    if (!subdomainMatch) {

      // Remove the client ID from path for local
      requestUrl = req.url.replace(`/${clientId}`, '');
    }
    
    const requestData: RequestMessage = {
      type: 'request',
      id: reqId,
      method: req.method,
      url: requestUrl,
      headers: Object.fromEntries(req.headers.entries()),
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : null,
    };

    client.ws.send(JSON.stringify(requestData));

    // Wait for response
    return new Promise<Response>((resolve, reject) => {
      pendingRequests.set(reqId, { resolve, reject });
      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(reqId)) {
          pendingRequests.delete(reqId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    }).catch(() => new Response("Request timeout", { status: 504 }));
  },
  websocket: {
    message(ws, message) {
      try {
        const data: WSMessage = JSON.parse(message as string);
        if (data.type === 'response') {
          const resMsg = data as ResponseMessage;
          const pending = pendingRequests.get(resMsg.id);
          if (pending) {
            pendingRequests.delete(resMsg.id);
            let body: string | Uint8Array;
            if (resMsg.body.type === 'binary') {
              body = new Uint8Array(Buffer.from(resMsg.body.data, 'base64'));
            } else {
              body = resMsg.body.data;
            }
            const response = new Response(body, {
              status: resMsg.status,
              headers: resMsg.headers,
            });
            pending.resolve(response);
          }
        }
      } catch (e) {
        console.error('Invalid message:', message);
      }
    },
    open(ws) {
      const clientId = generateClientId();
      clients.set(clientId, { ws });
      console.log(`Client connected with ID: ${clientId}`);
      // Send tunnel URL to client
      const domain = process.env.TUNNEL_DOMAIN || 'localhost:8080';
      const isProduction = process.env.NODE_ENV === 'production';
      const protocol = isProduction ? 'https' : 'http';
      let tunnelUrl: string = `${protocol}://${clientId}.${domain}`;

      const tunnelMessage: TunnelMessage = {
        type: 'tunnel',
        url: tunnelUrl,
      };
      ws.send(JSON.stringify(tunnelMessage));
    },
    close(ws, code, message) {
      console.log('Client disconnected');
      for (const [id, client] of clients) {
        if (client.ws === ws) {
          clients.delete(id);
          break;
        }
      }
      // Reject pending requests for this client
      for (const [reqId, { reject }] of pendingRequests) {
        reject(new Error('Client disconnected'));
      }
      pendingRequests.clear();
    },
  },
});

console.log('Proxy server running on http://localhost:8080 and ws://localhost:8080');