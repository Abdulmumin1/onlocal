# OnLocal

Expose your local development server to the internet securely via tunnels.

## Built on Bun & Durable Objects: 

```bash
bunx onlocal PORT
```

## How to Use (Cloning the repo yourself)

1. Install dependencies: `bun install`
2. Start the proxy server: `cd packages/proxy && bun run index.ts`
3. In another terminal, connect your local server: `cd packages/onlocal && bun run index.ts <port>`

Your local server on `<port>` will be accessible at a generated tunnel URL (e.g., `https://lucky-bread.onlocal.dev`).

## What It Runs On

- **Runtime**: Bun (JavaScript runtime)
- **Server/Proxy**: Cloudflare workers + Durable Objects;

## Code Structure

- `packages/onlocal/`: CLI tool that forwards local requests to the proxy via WebSocket
- `packages/proxy/`: Local proxy server that handles tunnel creation and HTTP forwarding
- `packages/proxy-worker/`: Cloudflare Worker version for production deployment
- `apps/landing/`: Landing page built with Svelte

## Features

### Supported
- HTTP request proxying (GET, POST, etc.)
- Automatic tunnel URL generation with SSL/TLS security
- Secure random tunnel IDs

### Not Supported Yet
- [ ] WebSocket proxying
- [ ] HTTPS tunnels
- [ ] Custom domains
- [ ] Authentication