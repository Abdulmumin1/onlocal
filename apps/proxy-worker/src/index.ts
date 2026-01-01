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

  console.log('Provided clientId:', providedClientId);

  if (providedClientId && await c.env.TUNNEL_KV.get(providedClientId)) {
    // Reuse existing tunnel
    clientId = providedClientId;
    const doIdString = await c.env.TUNNEL_KV.get(clientId);
    doId = c.env.TUNNEL_DO.idFromString(doIdString!);
    console.log('Reusing WS for clientId:', clientId, 'doId:', doId.toString());
    const stub = c.env.TUNNEL_DO.get(doId);
    const newReq = new Request(c.req.raw, {
      headers: { ...Object.fromEntries(c.req.raw.headers.entries()), 'X-Client-Id': clientId, 'X-Provided-Id': providedClientId ?? '' }
    });
    return await stub.fetch(newReq);
  } else {
    
    // Create new tunnel
    clientId = providedClientId ?? Math.random().toString(36).substr(2, 9);
    doId = c.env.TUNNEL_DO.newUniqueId();
    console.log('New WS: clientId:', clientId, 'doId:', doId.toString());
    try {
      await c.env.TUNNEL_KV.put(clientId, doId.toString());
      console.log('KV stored for clientId:', clientId);
    } catch (e) {
      // fdsaf
      console.error('KV put error:', e);
    }
  }

  const stub = c.env.TUNNEL_DO.get(doId);
  const newReq = new Request(c.req.raw, {
    headers: { ...Object.fromEntries(c.req.raw.headers.entries()), 'X-Client-Id': clientId, 'X-Provided-Id': providedClientId ?? '' }
  });
  return await stub.fetch(newReq);
});

app.all('*', async (c) => {
  console.log('HTTP request:', c.req.url, 'host:', c.req.header('host'));
  // Extract client ID from subdomain
  const host = c.req.header('host') || '';
  const domain = c.env.TUNNEL_DOMAIN || 'localhost';
  const url = new URL(c.req.url);
  let clientId: string | null = null;

  const subdomainMatch = host.match(new RegExp(`^([a-z0-9]+)\\.${domain.replace(/\./g, '\\.')}`));
  if (subdomainMatch) {
    clientId = subdomainMatch[1];
  }

  console.log('Host:', host, 'Path:', url.pathname, 'ClientId:', clientId);
  if (!clientId) {
    // Serve install script from root domain
    if (url.pathname === '/install.sh') {
      return c.redirect('https://raw.githubusercontent.com/Abdulmumin1/onlocal/main/install.sh', 302);
    }
    return c.redirect('https://onlocal.pages.dev', 302);
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