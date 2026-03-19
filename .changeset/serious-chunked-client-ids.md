---
"onlocal": patch
---

- Added support for custom client IDs via `--client`, including availability checks and validation for lowercase alphanumeric IDs with a minimum length of 7.
- Fixed reconnect and tunnel ownership handling for custom client IDs so stale mappings, duplicate control sockets, and reconnect handoffs do not break active tunnels.
- Reworked the control transport to stream HTTP responses in chunks instead of sending full bodies in one WebSocket message, which avoids large-message disconnects and correctly handles null-body responses like `304 Not Modified`.
