#!/usr/bin/env bun
/**
 * Simple WebSocket echo server for testing WebSocket passthrough
 * Run with: bun test/ws-echo-server.ts
 */

const port = parseInt(process.argv[2] || "3000");

console.log(`🔌 WebSocket Echo Server starting on port ${port}...`);

Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      const success = server.upgrade(req, {
        data: { path: url.pathname },
      });
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Regular HTTP
    return new Response(`HTTP OK - path: ${url.pathname}`, {
      headers: { "Content-Type": "text/plain" },
    });
  },
  websocket: {
    open(ws) {
      console.log(`[WS] Connection opened: ${ws.data.path}`);
      ws.send(JSON.stringify({ type: "connected", path: ws.data.path }));
    },
    message(ws, message) {
      const msg = typeof message === "string" ? message : "[binary]";
      console.log(`[WS] Received: ${msg}`);

      // Echo back
      if (typeof message === "string") {
        try {
          const data = JSON.parse(message);
          ws.send(JSON.stringify({ type: "echo", received: data }));
        } catch {
          ws.send(JSON.stringify({ type: "echo", received: message }));
        }
      } else {
        // Binary echo
        ws.send(message);
      }
    },
    close(ws, code, reason) {
      console.log(`[WS] Connection closed: code=${code}, reason=${reason}`);
    },
  },
});

console.log(`✅ WebSocket Echo Server running on ws://localhost:${port}`);
console.log(`   HTTP endpoint: http://localhost:${port}`);
console.log(`   WebSocket endpoint: ws://localhost:${port}/socket`);
console.log(`\nPress Ctrl+C to stop`);
