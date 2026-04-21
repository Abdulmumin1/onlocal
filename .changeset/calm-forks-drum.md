---
"onlocal": patch
---

- Reduced reconnect noise in the CLI by replacing repeated websocket error/reconnect banners with a persistent session status indicator and configurable log verbosity.
- Fixed tunnel reconnection getting stuck after network interruptions by timing out stalled websocket connection attempts and retrying cleanly.
- Simplified the tunnel header to show the public URL and local forwarding target without the large bordered box.
