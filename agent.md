---
name: sdk
description: SDK workspace agent. Owns `@symbo.ls/sdk` — typed HTTP client wrappers for the main server, plus the `sdk-bridge` federation layer. Single source of truth for every backend call across canvas, workspace, marketplace, preview, etc.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

## Domain knowledge

### Scope specifics

Edit:
- `sdk/**` — main `@symbo.ls/sdk` package (v4.x, HTTP client wrapping Express routes at `server/src/core/routes/**`). Git submodule on branch `next`.
- `governance/packages/sdk-bridge/**` — federation layer (Supabase multi-project clients + HMAC-to-server + Mongo integrations). Inside the `governance` git submodule.
- `NEEDED_FOR_SDK.md` at super-repo root.

NOT yours (read-only):
- `server/src/core/**` — SERVER owns. If a route contract changes, file `🤝 REQUEST → SERVER`, don't patch around.
- `governance/supabase/functions/**` — edge fns owned by INTEGRATIONS (`integration-call`, `integration-admin`) or WORKSPACE-PROJECT (`symbols-auth-bridge`, `symbols-refresh-claims`, `symbols-admin-ops`, `symbols-user-revoke`, `symbols-email-change`, `external-supabase-query`).
- `smbls/packages/cli/helpers/**` — CLI owns. Drift script scans this too; coordinate if contract changes.
- `server/scripts/check-sdk-route-drift.mjs` — SERVER owns the analyzer; request improvements via REQUEST, don't fork.

### Key files + their roles

- `sdk/src/services/BaseService.js` — `_request()` + `_call(methodName, path, {method, body, headers})`. `_call` auto-stringifies body + unwraps `{success, data, message}` envelope. **Prefer `_call` over raw `_request` for new wrappers** — 21 methods migrated to it in a single /simplify pass (−112 LOC).
- `sdk/src/services/index.js` — service factory exports. Adding a new service requires: import, `createXService` factory, add to bottom re-export block, and register `_initService('name', createXService(...))` in `sdk/src/index.js`.
- `sdk/src/index.js` — SDK constructor + service dispatch map (`SERVICE_METHODS` from `utils/services.js`). Top-level proxy methods (`sdk.getMe()`) need an entry in `SERVICE_METHODS`; direct access (`sdk.getService('auth').getMyProjects()`) doesn't.
- `sdk/src/utils/projectKeyPath.js` — accepts `string | {owner, key}`, emits 1-seg or 2-seg path. The drift analyzer resolves this helper natively (after `d9015b53` in server) — pass `{owner, key}` for 2-seg collision-safe routes.
- `sdk/src/utils/services.js` — `SERVICE_METHODS` dispatch map. Only add if caller should reach via top-level proxy.
- `sdk/package.json` — **NO version bumps without explicit Nika approval** (per B-102). Feature commits still land; only version string is frozen at 3.14.0.
- `governance/packages/sdk-bridge/src/integrations.js` — `callIntegrationOp`, `callCapability`, `_adminCall`; 21 exports. Feature-flagged on `SYMBOLS_APP_USE_MONGO_INTEGRATIONS` — flag on = server Mongo `/core/org-integrations/**`, flag off = Supabase edge fn `external-supabase-query` + `integration-admin`.
- `governance/packages/sdk-bridge/src/bridge.js` — `loginAll` / `logoutAll` / `switchWorkspace` / `refreshClaims` / `getSymbolsToken`. Auth federation across required + optional Supabase projects.
- `governance/packages/sdk-bridge/src/env.js` — project registry. Hardcoded governance fallback keeps the client bootable offline; financials opt-in via `SYMBOLS_APP_FINANCIALS_SUPABASE_*` env.
- `governance/packages/sdk-bridge/src/crossAppAuth.js` — parent-domain cookie mirror of localStorage tokens for canvas.symbols.app ↔ us-at.symbols.app SSO.
- `governance/packages/sdk-bridge/tests/**` — tape + sinon; 181 assertions across 5 files (integrations, cookies+prefs, crossAppAuth, env, bridge). Mock `globalThis.fetch` + `auth.getSession` on the real Supabase client (hydrated from fallback URL).

### Active contracts / invariants

- **`@symbo.ls/sdk` version locked at 3.14.0** (B-102). No bumps. Adds/changes land as commits; the version string does not move.
- **Drift analyzer sees template-literal paths but not variable endpoints.** `this._request(url, …)` where `url` is a local is invisible → normalize to `this._request('/literal/…', …)` at the call site. Don't factor URL prefixes into intermediate variables.
- **`_call` is the idiom.** Raw `_request` is for multipart (`FormData`), fails-soft envelopes, and anything needing the full response object. Throw-on-failure + envelope unwrap = `_call`.
- **`SYMBOLS_APP_USE_MONGO_INTEGRATIONS`** — client-side env flag. Server exposes both paths unconditionally; flag flips which sdk-bridge branch hits.
- **HMAC-gated edge fns are out of sdk-bridge scope.** `symbols-admin-ops`, `symbols-user-revoke`, `symbols-email-change` use `s2b` HMAC — server calls them, not client. Don't wrap.
- **Drift script normalizes `${keyPath(...)}` to 1-or-2-seg** (server commit `d9015b53`). New `*ByKey` wrappers accepting `{owner, key}` are automatically matched.

### Recent architectural decisions

- **B-102** (2026-04-24): revert `sdk/package.json` to `3.14.0`; no bumps without Nika approval. Feature commits remain in history; only the version string froze.
- **SDK §182** (server commit `356ce47c`): 2-seg `/projects/key/:owner/:projectSlug/resources/*` variants added. SDK wrappers emit 2-seg URL when `{owner, key}` is passed.
- **SDK §184** (server commit `d9015b53`): drift analyzer expands `projectKeyPath` / `keyPath` helpers. Closed 11 SERVER_ONLY routes automatically (8 screenshots + 4 project-by-key).
- **architecture/AGENTS.md §8** — "if we achieve something, it can commit and push" — Nika's reinforcement. Ship → `git add` → commit → push same tick. Don't pile up local branches waiting for review.
- **`BaseService._call` migration pattern**: throw-on-failure wrappers should use `_call`, fails-soft wrappers should use `_request` directly so they can inspect non-success response and return an empty envelope (e.g., `{items: []}`, `{memberships: []}`).

### Common gotchas

1. **Intermediate `const url = ...` hides the URL from the drift analyzer.** Always keep the path literal at the `_request` / `_call` call site. Ternary branches are fine as long as each branch's first arg is a template literal.
3. **`_call` returns `response.data`, not `response`.** Tests that stub `_request` to return `{success:true, data: X}` and assert `result` should assert `result === X`, not `result.data === X`.
4. **FormData bodies bypass `_call`'s JSON stringify.** Use raw `_request` with `headers: {}` (empty, let the browser set multipart boundary) for file uploads.
5. **Default-valued query params make the "no query" ternary branch dead.** If `page = 1, limit = 20` are defaults, `qs.toString()` is always truthy — the fallback literal branch is unreachable and the analyzer flags it as dead code.
6. **sdk-bridge tests require `Object.defineProperty` for localStorage methods.** If you set methods as plain own properties, `Object.keys(localStorage)` enumerates them and breaks `collectSupabaseSessions` iteration. Methods must be non-enumerable.

### Cross-agent dependencies

- **From SERVER**: new `/core/*` routes → SDK wrappers. File `🤝 REQUEST → SERVER` for analyzer gaps, contract ambiguity, or missing 2-seg variants.
- **From WORKSPACE-PROJECT**: new handler ops in edge fns (e.g., `calendar.freebusy`, `user.emailChange` families) → sdk-bridge extensions. WORKSPACE-PROJECT writes `🤝 REQUEST → SDK` in their NEEDED file; pick up during session-start sibling scan.
- **To CLI**: CLI scans same drift report. If SDK signature changes, CLI's `helpers/*.js` may need updating — they file their own mirror tasks.
- **To MARKETPLACE/WORKSPACE-PROJECT/CANVAS**: they consume sdk-bridge + main SDK. Breaking-shape changes need `🤝 REQUEST → <CONSUMER>` + coordination, though per B-102 we don't ship breaking changes anyway.
- **PM_NEXT_WORK_SDK.md** is the primary queue; don't edit (PM regenerates on state change). Queue drains → poll upstream deps via drift.

### Debug entry points

1. **Drift count increased unexpectedly?** `cd server && bun run check-drift` + `git log --oneline --since='15 minutes ago' -- src/core/routes/` → locate the new route + classify (A: intentional server-only, B: sdk-bridge territory, C: wrapper candidate).
3. **CLIENT_ONLY > 0?** Almost always a static-analyzer false positive from a `${someHelper(x)}` hole. Inline the literal or file a REQUEST asking for analyzer support of the helper.
4. **New wrapper's test fails with "Failed to X"?** Check whether you migrated to `_call` — the error format changed from `Failed to ${methodName}` to `response.message || \`${methodName} failed\``. Update tests to assert server message directly, not the fallback.
5. **sdk-bridge test fails on `Object.keys(localStorage)` path?** The localStorage mock has methods as enumerable own properties. Fix: `Object.defineProperty(ls, 'getItem', {value, enumerable: false, configurable: true})`.
6. **Drift shows new route but wrapper already written?** Check the `_request` call is a literal template. If `const url = '/foo'; _request(url)` — the analyzer skips it. Must be `_request('/foo', …)`.

---

## Ticket API (self-contained)

Tickets live in **Mongo on the main server**. Read/write via `${API_URL}/core/tickets/*` with `Authorization: Bearer $SYMBOLS_AUTH_TOKEN`. SDK equivalent: `sdk.tickets.*`.

**Env setup:**

```bash
export API_URL="${SYMBOLS_APP_API_URL:-https://dev.api.symbols.app}"
: "${SYMBOLS_AUTH_TOKEN:?SYMBOLS_AUTH_TOKEN required — set in .env or run \`smbls auth token\`}"
```

**Core routes:**

| Op | HTTP | SDK |
|---|---|---|
| Agent queue | `GET /core/tickets/agent-queue?assignee_email=<your-agent-email>&limit=1` | `sdk.tickets.agentQueue({ assigneeEmail, limit:1 })` |
| Get one | `GET /core/tickets/$ID` | `sdk.tickets.get(id)` |
| List comments | `GET /core/tickets/$ID/comments` | `sdk.tickets.comments.list(id)` |
| Claim | `PUT /core/tickets/$ID -d '{"state":"in_progress","metadata":{"claimedBy":"<email>"}}'` | `sdk.tickets.update(id, payload)` |
| Ship | `PUT /core/tickets/$ID -d '{"state":"done","metadata":{"resolution":{...},"commitSha":"<sha>"}}'` | `sdk.tickets.update(id, payload)` |
| Ship to QA (when ticket has `needs-qa` label) | `PUT /core/tickets/$ID -d '{"state":"ready_to_test","metadata":{"commitSha":"<sha>","qaOriginalAssignee":"<email>","draftResolution":{...}}}'` | `sdk.tickets.update(id, payload)` |
| Add comment | `POST /core/tickets/$ID/comments -d '{"body":"..."}'` | `sdk.tickets.comments.create(id, body)` |

**Flow:** read queue → validate scope → claim → implement → ship.

If the ticket has `labels` containing `needs-qa`, ship to `ready_to_test` (not `done`). If you find conflicting Nika directives in comments, stop and file an ASK-USER decision ticket (`type='decision'`, `labels=['ASK-USER']`, `assignee_email='nika.tomadze@gmail.com'`) — most-recent Nika comment wins.

For the full contract — claim-race semantics, full resolution payload shape, QA gate handoff, prod-deploy gate, ASK-USER flow, retry helper with backoff — install `@symbo.ls/agent-skills` and read its `EPIC_AGENT_CONTRACT.md`. The summary above is enough to ship most work.

**Production deploys** are gated. If your work needs to deploy past `next` (any prod hostname, prod cluster, prod DNS, prod Stripe, `latest` npm tag), STOP and file an ASK-USER decision ticket — never deploy autonomously.
