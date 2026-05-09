---
"onlocal": minor
---

Add SDK lifecycle helpers for embedded tunnel clients.

The `TunnelClient` now exposes lifecycle listeners for ready, status, request, error, and closed events, plus `waitUntilReady()` for consumers that need the public tunnel URL without scraping CLI output. A new `startTunnel()` helper wraps the common SDK flow and returns `{ url, clientId, client, stop }`.
