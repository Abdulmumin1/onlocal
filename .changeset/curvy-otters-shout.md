---
"onlocal": patch
---

- Removed the `onlocal config` command and deleted CLI config file support.
- The CLI now requires an explicit local port argument instead of reading defaults from `~/.onlocal/config.yml`.
- Self-hosted tunnel servers should now be configured via the `TUNNEL_DOMAIN` environment variable when starting the CLI.
