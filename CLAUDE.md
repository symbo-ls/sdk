# sdk — CLAUDE.md

`@symbo.ls/sdk` — the single typed HTTP client every frontend uses to
call the main server. Wraps `/core/*` Express routes; a missing method
is an SDK ticket, never a raw-fetch bypass in a consumer.

## Build / test / run

```bash
npm run lint
npm run lint:fix
npm run build            # rimraf dist && build:esm && build:types
npm run build:esm          # esbuild → dist/esm
npm run build:types         # tsc (non-fatal on error, publish proceeds)
npm run watch                # esbuild --watch, for a consumer's dev-loop
npm run test:smoke            # bun run _inf -- tape integration-tests/smoke
npm run test:auth
npm run test:all              # full tape + tap-spec integration suite
npm run test:unit-all          # tape src/services/tests/**/*.test.js
```

Consumers resolve `@symbo.ls/sdk` to `dist/esm/`, not `src/` — run
`npm run watch` in a side terminal while iterating so edits propagate.

## Conventions

`server/src/core/**` is server-owned — if a route contract changes, ask
the server owner before patching around it; don't fork the contract.
`smbls/packages/cli/helpers/**` (CLI) and
`server/scripts/check-sdk-route-drift.mjs` (the drift analyzer) are
owned elsewhere too — coordinate on changes.

Key files: `src/services/BaseService.js` (`_call` throws + unwraps the
`{success,data,message}` envelope — prefer it over raw `_request` for
new wrappers); `src/index.js` (constructor + `SERVICE_METHODS` dispatch
map — a top-level proxy method needs an entry here); `src/services/
index.js` (service factory registration).

Drift analyzer gotchas: it sees template-literal paths only — keep the
URL literal at the `_request`/`_call` call site, never hoist it into a
local `const url = …`. FormData bodies bypass `_call`'s JSON stringify —
use raw `_request` with empty headers for uploads.

## Agent protocol

DONE = shipped + tested + live-verified: green tests AND a live check
from a real consumer app — a passing build alone is not done.

Work is tracked on the my.symbols platform ticket you were assigned —
camelCase `assigneeEmail`, keep the ticket body self-contained.

Escalate repo questions or blockers to thomas@symbols.app.

## Never

- `npm`/`lerna`/`bun`/`yarn publish` — push to `main`; release-manager
  owns publishing.
- Bump `package.json`'s version — pinned at `3.14.0` (B-102); feature
  commits land, the version string does not move without explicit
  sign-off.
- Hardcode content or data.
- Let a consumer bypass you with raw `fetch()`/`axios` — that is the
  bug this package exists to prevent.
- Edit shared libraries without permission; `git stash` on a shared
  checkout.
