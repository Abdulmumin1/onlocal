# onlocal

Expose your localhost to the internet. A simple, self-hostable tunneling solution.

## Installation

### Quick Install (Recommended)

**macOS / Linux**

```bash
curl -fsSL https://onlocal.dev/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Abdulmumin1/onlocal/main/install.ps1 | iex
```

This downloads the appropriate binary for your platform and adds it to your PATH.

### Via npm

```bash
npm install -g onlocal
```

Also works with `bun`, `pnpm`, and `yarn`.

### Manual Download

Download the binary for your platform from the [releases page](https://github.com/Abdulmumin1/onlocal/releases):

- `onlocal-linux-x64` - Linux x64
- `onlocal-linux-arm64` - Linux ARM64
- `onlocal-darwin-x64` - macOS Intel
- `onlocal-darwin-arm64` - macOS Apple Silicon
- `onlocal-windows-x64.exe` - Windows x64

## Usage

```bash
onlocal <port>
```

Example:

```bash
onlocal 3000
```

This exposes `localhost:3000` and gives you a public URL like `https://abc123.onlocal.dev`.

### Configuration

You can configure the default behavior (e.g., self-hosted tunnel URL) using:

```bash
onlocal config
```

This will open an interactive setup to save your preferences to `~/.onlocal/config.yml`.

## How It Works

onlocal consists of two components:

```
+-----------------+         +-----------------+         +-----------------+
|   Your App      |         |  onlocal CLI    |         |  proxy-worker   |
|  localhost:3000 | <-----> |   (client)      | <-----> |  (Cloudflare)   |
+-----------------+   HTTP  +-----------------+   WS    +-----------------+
                                                              |
                                                              | HTTPS
                                                              v
                                                        +-----------------+
                                                        |   Internet      |
                                                        | abc.onlocal.dev |
                                                        +-----------------+
```

### onlocal (CLI Client)

Located in `packages/onlocal`. The CLI client runs on your machine and:

1. Establishes a WebSocket connection to the proxy server
2. Receives a unique subdomain (e.g., `abc123.onlocal.dev`)
3. Listens for incoming HTTP requests over the WebSocket
4. Forwards requests to your local server
5. Sends responses back through the WebSocket

The client handles automatic reconnection with exponential backoff if the connection drops.

### proxy-worker (Cloudflare Worker)

Located in `apps/proxy-worker`. The proxy server runs on Cloudflare Workers with Durable Objects and:

1. Accepts WebSocket connections from CLI clients
2. Assigns unique subdomains to each client
3. Routes incoming HTTP requests from `*.onlocal.dev` to the correct client
4. Maintains persistent connections using Durable Objects
5. Stores client-to-tunnel mappings in KV

Each tunnel gets its own Durable Object instance, ensuring isolation and persistence.

## Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| `packages/onlocal` | Bun/Node.js | CLI client binary |
| `apps/proxy-worker` | Cloudflare Workers | Edge proxy server |
| Durable Objects | Cloudflare | WebSocket management, request routing |
| KV | Cloudflare | Client ID to Durable Object mapping |

## Self-Hosting

To run your own instance:

### 1. Deploy the proxy worker

```bash
cd apps/proxy-worker
pnpm install
pnpm run deploy
```

Configure your `wrangler.toml` with your domain and KV namespace.

### 2. Point the CLI to your server

Modify the `TUNNEL_DOMAIN` in the client or fork the project.

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- [pnpm](https://pnpm.io) for the worker

### Running locally

Start the proxy worker:

```bash
cd apps/proxy-worker
pnpm run dev
```

Run the CLI:

```bash
cd packages/onlocal
bun run dev 3000
```

### Building binaries

```bash
cd packages/onlocal
bun run build:bin
```

This produces binaries for all supported platforms in `dist/bin/`.

## Supported Platforms

| Platform | Architecture |
|----------|--------------|
| Linux | x64, arm64 |
| macOS | x64 (Intel), arm64 (Apple Silicon) |
| Windows | x64 |

## Features

### Supported

- HTTP request proxying (GET, POST, PUT, DELETE, etc.)
- Automatic tunnel URL generation with SSL/TLS
- Automatic reconnection on network errors
- Binary response handling (images, files, etc.)

### Not Yet Supported

- WebSocket proxying
- Custom domains

## License

MIT
