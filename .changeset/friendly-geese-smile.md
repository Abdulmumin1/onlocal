---
"onlocal": patch
---

Fix Node.js SDK imports by publishing built JavaScript entrypoints and generated type declarations instead of exposing raw TypeScript source files. This also trims the published package to just the runtime and type artifacts needed by SDK consumers.
