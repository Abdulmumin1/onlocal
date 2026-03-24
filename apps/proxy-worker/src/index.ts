import { Hono } from 'hono';
import { TunnelDO } from './durable';
import { getWebSocketConnectionParams, isWebSocketUpgrade } from './websocket';

const app = new Hono<{ Bindings: { TUNNEL_DO: DurableObjectNamespace, TUNNEL_KV: KVNamespace, TUNNEL_DOMAIN: string } }>();
const CLIENT_ID_PATTERN = /^[a-z0-9]{7,}$/;

function isValidClientId(clientId: string): boolean {
  return CLIENT_ID_PATTERN.test(clientId);
}

function getClientIdFromHost(host: string, domain: string): string | null {
  const subdomainMatch = host.match(
    new RegExp(`^([a-z0-9]+)\\.${domain.replace(/\./g, '\\.')}`)
  );

  return subdomainMatch?.[1] ?? null;
}

async function getTunnelStatus(
  env: { TUNNEL_DO: DurableObjectNamespace; TUNNEL_KV: KVNamespace },
  clientId: string
): Promise<{ doIdString: string; active: boolean } | null> {
  const doIdString = await env.TUNNEL_KV.get(clientId);
  if (!doIdString) {
    return null;
  }

  const doId = env.TUNNEL_DO.idFromString(doIdString);
  const stub = env.TUNNEL_DO.get(doId);
  const response = await stub.fetch("https://internal/status", {
    headers: {
      "X-Internal-Action": "status",
    },
  });

  if (!response.ok) {
    return { doIdString, active: true };
  }

  const status = (await response.json()) as { active: boolean };
  return { doIdString, active: status.active };
}

async function proxyTunnelRequest(
  env: { TUNNEL_DO: DurableObjectNamespace; TUNNEL_KV: KVNamespace },
  request: Request,
  clientId: string
) {
  const doIdString = await env.TUNNEL_KV.get(clientId);
  console.log('doIdString from KV:', doIdString);
  if (!doIdString) {
    return new Response('Tunnel not found', { status: 404 });
  }

  const doId = env.TUNNEL_DO.idFromString(doIdString);
  const stub = env.TUNNEL_DO.get(doId);
  return await stub.fetch(request);
}

function rejectWebSocketPassthrough() {
  return new Response('WebSocket passthrough is disabled', {
    status: 501,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

app.get('/ws', async (c) => {
  console.log('WS request received');
  const host = c.req.header('host') || '';
  const domain = c.env.TUNNEL_DOMAIN || 'localhost';
  const subdomainClientId = getClientIdFromHost(host, domain);
  const upgradeHeader = c.req.header('Upgrade');

  if (subdomainClientId) {
    if (isWebSocketUpgrade(upgradeHeader)) {
      console.log('Rejecting tunneled websocket upgrade for clientId:', subdomainClientId);
      return rejectWebSocketPassthrough();
    }

    console.log('Treating /ws request as tunneled app traffic for clientId:', subdomainClientId);
    return await proxyTunnelRequest(c.env, c.req.raw, subdomainClientId);
  }

  if (!isWebSocketUpgrade(upgradeHeader)) {
    return c.text('Expected websocket', 400);
  }

  const {
    providedClientId,
    reconnectToken,
    connectionId: requestedConnectionId,
  } = getWebSocketConnectionParams(c.req.raw);
  const connectionId = requestedConnectionId ?? crypto.randomUUID();
  let clientId: string;
  let doId: DurableObjectId;

  console.log('Control websocket params:', {
    hasClientId: Boolean(providedClientId),
    hasReconnectToken: Boolean(reconnectToken),
    hasConnectionId: Boolean(requestedConnectionId),
  });

  if (!reconnectToken) {
    return c.text('Missing reconnect token', 400);
  }

  if (providedClientId && !isValidClientId(providedClientId)) {
    return c.text('Invalid client ID. Use at least 7 lowercase letters or numbers.', 400);
  }

  const existingTunnel =
    providedClientId ? await getTunnelStatus(c.env, providedClientId) : null;

  if (providedClientId && existingTunnel?.active) {
    clientId = providedClientId;
    doId = c.env.TUNNEL_DO.idFromString(existingTunnel.doIdString);
    const stub = c.env.TUNNEL_DO.get(doId);
    const newReq = new Request(c.req.raw, {
      headers: {
        ...Object.fromEntries(c.req.raw.headers.entries()),
        'X-Client-Id': clientId,
        'X-Provided-Id': providedClientId ?? '',
        'X-Reconnect-Token': reconnectToken,
        'X-Connection-Id': connectionId,
      }
    });
    return await stub.fetch(newReq);
  }

  if (providedClientId && existingTunnel && !existingTunnel.active) {
    await c.env.TUNNEL_KV.delete(providedClientId);
  }

  clientId = providedClientId ?? Math.random().toString(36).substr(2, 9);
  doId = c.env.TUNNEL_DO.newUniqueId();
  console.log('New WS: clientId:', clientId, 'doId:', doId.toString());
  try {
    await c.env.TUNNEL_KV.put(clientId, doId.toString());
    console.log('KV stored for clientId:', clientId);
  } catch (e) {
    console.error('KV put error:', e);
  }

  const stub = c.env.TUNNEL_DO.get(doId);
  const newReq = new Request(c.req.raw, {
    headers: {
      ...Object.fromEntries(c.req.raw.headers.entries()),
      'X-Client-Id': clientId,
      'X-Provided-Id': providedClientId ?? '',
      'X-Reconnect-Token': reconnectToken,
      'X-Connection-Id': connectionId,
    }
  });
  return await stub.fetch(newReq);
});

app.get('/client-id/:clientId/status', async (c) => {
  const clientId = c.req.param('clientId');

  if (!isValidClientId(clientId)) {
    return c.text('Invalid client ID. Use at least 7 lowercase letters or numbers.', 400);
  }

  const existingTunnel = await getTunnelStatus(c.env, clientId);
  if (existingTunnel?.active) {
    return c.json({ available: false, reason: 'taken' }, 409);
  }

  if (existingTunnel && !existingTunnel.active) {
    await c.env.TUNNEL_KV.delete(clientId);
  }

  return c.json({ available: true });
});

app.delete('/client-id/:clientId/release', async (c) => {
  const clientId = c.req.param('clientId');
  const reconnectToken = c.req.header('X-Reconnect-Token');

  if (!isValidClientId(clientId)) {
    return c.text('Invalid client ID. Use at least 7 lowercase letters or numbers.', 400);
  }

  if (!reconnectToken) {
    return c.text('Missing reconnect token', 400);
  }

  const existingTunnel = await getTunnelStatus(c.env, clientId);
  if (!existingTunnel) {
    return new Response(null, { status: 204 });
  }

  const doId = c.env.TUNNEL_DO.idFromString(existingTunnel.doIdString);
  const stub = c.env.TUNNEL_DO.get(doId);
  const response = await stub.fetch('https://internal/release', {
    method: 'POST',
    headers: {
      'X-Internal-Action': 'release',
      'X-Reconnect-Token': reconnectToken,
    },
  });

  if (!response.ok) {
    return c.text(await response.text(), response.status as 401 | 500);
  }

  await c.env.TUNNEL_KV.delete(clientId);
  return new Response(null, { status: 204 });
});

app.all('*', async (c) => {
  console.log('HTTP request:', c.req.url, 'host:', c.req.header('host'));
  // Extract client ID from subdomain
  const host = c.req.header('host') || '';
  const domain = c.env.TUNNEL_DOMAIN || 'localhost';
  const url = new URL(c.req.url);
  const clientId = getClientIdFromHost(host, domain);
  const upgradeHeader = c.req.header('Upgrade');

  console.log('Host:', host, 'Path:', url.pathname, 'ClientId:', clientId);
  if (!clientId) {
    // Serve install script from root domain
    if (url.pathname === '/install.sh') {
      return c.redirect('https://raw.githubusercontent.com/Abdulmumin1/onlocal/main/install.sh', 302);
    }
    return c.redirect('https://onlocal.pages.dev', 302);
  }

  if (isWebSocketUpgrade(upgradeHeader)) {
    console.log('Rejecting tunneled websocket upgrade for clientId:', clientId, 'path:', url.pathname);
    return rejectWebSocketPassthrough();
  }

  return await proxyTunnelRequest(c.env, c.req.raw, clientId);
});

export default app;
export { TunnelDO };
