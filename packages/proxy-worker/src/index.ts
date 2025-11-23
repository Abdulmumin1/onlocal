import { Hono } from 'hono';
import { TunnelDO } from './durable';

const app = new Hono<{ Bindings: { TUNNEL_DO: DurableObjectNamespace, TUNNEL_KV: KVNamespace, TUNNEL_DOMAIN: string } }>();

app.get('/ws', async (c) => {
  console.log('WS request received');
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected websocket', 400);
  }

  const providedClientId = c.req.query('clientId');
  let clientId: string;
  let doId: DurableObjectId;

  if (providedClientId && await c.env.TUNNEL_KV.get(providedClientId)) {
    // Reuse existing tunnel
    clientId = providedClientId;
    const doIdString = await c.env.TUNNEL_KV.get(clientId);
    doId = c.env.TUNNEL_DO.idFromString(doIdString!);
    console.log('Reusing WS for clientId:', clientId, 'doId:', doId.toString());
  } else {
    // Create new tunnel
    clientId = Math.random().toString(36).substr(2, 9);
    doId = c.env.TUNNEL_DO.newUniqueId();
    console.log('New WS: clientId:', clientId, 'doId:', doId.toString());
    try {
      await c.env.TUNNEL_KV.put(doId.toString(), clientId);
      await c.env.TUNNEL_KV.put(clientId, doId.toString());
      console.log('KV stored for clientId:', clientId);
    } catch (e) {
      console.error('KV put error:', e);
    }
  }

  const stub = c.env.TUNNEL_DO.get(doId);
  return await stub.fetch(c.req.raw);
});

app.all('*', async (c) => {
  console.log('HTTP request:', c.req.url, 'host:', c.req.header('host'));
  // Extract client ID from subdomain or path
  const host = c.req.header('host') || '';
  const domain = c.env.TUNNEL_DOMAIN || 'localhost';
  const url = new URL(c.req.url);
  let clientId: string | null = null;

  // First, try subdomain
  const subdomainMatch = host.match(new RegExp(`^([a-z0-9]+)\\.${domain.replace(/\./g, '\\.')}`));
  console.log('Subdomain match:', subdomainMatch);
  if (subdomainMatch) {
    clientId = subdomainMatch[1];
  } else {
    // Fallback for dev: use path /<clientId>
    const pathParts = url.pathname.split('/').filter(p => p);
    clientId = pathParts[0] || null;
  }

  console.log('Host:', host, 'Path:', url.pathname, 'ClientId:', clientId);
  if (!clientId) {
    return c.text('Invalid request', 400);
  }

  // Get DO ID from KV
  const doIdString = await c.env.TUNNEL_KV.get(clientId);
  console.log('doIdString from KV:', doIdString);
  if (!doIdString) {
    return c.text('Tunnel not found', 404);
  }
  const doId = c.env.TUNNEL_DO.idFromString(doIdString);
  const stub = c.env.TUNNEL_DO.get(doId);
  return await stub.fetch(c.req.raw);
});

export default app;
export { TunnelDO };