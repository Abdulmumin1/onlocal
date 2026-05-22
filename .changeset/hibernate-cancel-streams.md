---
"onlocal": minor
---

- Control WebSocket keepalive moved from DO-driven `setInterval` to Cloudflare edge auto-response, enabling Durable Object hibernation so idle tunnels stop accruing billable duration.
- New `request_cancel` protocol message: when an external client disconnects mid-request (SSE, streaming HTTP), the DO sends cancellation upstream and the CLI aborts the local `fetch()` via `AbortController`. This prevents leaked local requests and stuck SSE connections.
- All active and queued local requests are cleaned up when the control WebSocket drops, so reconnect recovers cleanly.
- Durable Object now persists connection state via `serializeAttachment`/`deserializeAttachment` across hibernation wakes.
- New observability counters (`wakes`, `cancellations`, `timeouts`, `streamedResponses`, etc.) exposed via the DO status endpoint and persist across hibernation.
