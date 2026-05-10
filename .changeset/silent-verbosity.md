---
"onlocal": patch
---

fix: respect `silent` verbosity over `always` level logs

Previously, `shouldLog` would short-circuit and return `true` for `always` level logs even if `verbosity` was set to `silent`. This caused issues for programmatic consumers (like TUIs) that explicitly requested silence, as proxy failures would still leak to `process.stdout` and corrupt the display. `silent` now correctly suppresses all CLI output.
