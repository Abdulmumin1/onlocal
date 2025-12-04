# onlocal

Expose your local development server to the internet securely via a web socket tunnel.

![onlocal.dev tunnel example in ghostty terminal](https://rawcontent.dearfutureself.me/portfolio/Screenshot%202025-11-23%20at%2021.32.33.png)

### Built on Bun & Durable Objects: 

```bash
bunx onlocal PORT
```
> supports npx and pnpx

## OR

install globaly

```bash
bun add -g onlocal
```

### How to Use (Cloning the repo yourself)

1. Install dependencies: `bun install`
2. Start the proxy server: `cd packages/proxy-worker && bun run index.ts`
3. In another terminal, connect your local server: `cd packages/onlocal && bun run index.ts <port>`

Your local server on `<port>` will be accessible at a generated tunnel URL (e.g., `https://lucky-bread.onlocal.dev`).

## What It Runs On

- **Runtime**: Bun (JavaScript runtime)
- **Server/Proxy**: Cloudflare workers + Durable Objects;

## Code Structure

- `packages/onlocal/`: CLI tool that forwards local requests to the proxy via WebSocket
- `packages/proxy/`: A rough POC a put together initially
- `packages/proxy-worker/`: Cloudflare Worker version for production deployment
- `apps/landing/`: Landing page built with Svelte

## Features

### Supported
- HTTP request proxying (GET, POST, etc.)
- Automatic tunnel URL generation with SSL/TLS security
- Automatic reconnect on network error;

### Not Supported Yet
- [ ] WebSocket proxying
- [ ] HTTPS tunnels
- [ ] Custom domains