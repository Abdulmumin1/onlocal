---
"onlocal": patch
---

fix: respect `silent` verbosity for session status banner

Extends the fix from the previous release to ensure the session status line (e.g. `● Session online`) is completely suppressed when `verbosity: "silent"` is requested, preventing layout corruption in TUI consumers.
