const server = Bun.serve({
  port: 3559,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return; // do not return a Response
    }
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    message(ws, message) {}, 
    open(ws) {}, 
    close(ws, code, message) {}, 
  },
});

console.log("Server running on: ", String(server.url));
