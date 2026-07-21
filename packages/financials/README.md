# @symbo.ls/sdk-financials

Opt-in financials extension for `@symbo.ls/sdk` — equity grants, compensation, investor profiles, and valuations.

## Architecture

This package is **NOT** part of the SDK core. The financials surface lives outside the core because it is:

- **Per-tenant** — only orgs with `'financials'` in `Organization.enabledExtensions[]` can access it. Default-installed orgs have only `'workspace-extension'`.
- **Sensitive** — equity / compensation / investor data needs hard permission gating; keeping it out of the core bundle reduces blast radius for SDK-only consumers (CLI, marketing tools, etc.) that should never see this data.
- **Backed by a separate Supabase project** — `bxhdvzwmvptgksqfkgqp` (the "financials" project), distinct from the former workspace-extension (governance) Supabase project (`becrzpqaiovbvfmrosro`, now removed).

All HTTP traffic goes to `/core/financials/*` on the main API server. The SDK never talks to the financials Supabase project directly — main server is the sole client + applies the `enabledExtensions['financials']` gate.

## Install

```sh
bun add @symbo.ls/sdk-financials
```

## Usage

```js
import { getSDK } from '@symbo-ls/workspace-shared/functions/sdk.js'
import { registerFinancials } from '@symbo.ls/sdk-financials'

// One-time at boot:
const sdk = getSDK()
await sdk.initialize()
registerFinancials(sdk)

// Now financials is a normal SDK surface:
const grants = await sdk.getService('financials').equityGrants.list({ workspaceId: '…' })

// Or via the dispatcher (DOMQL fetch: descriptors):
const valuations = await sdk.execute('financials.valuations', 'list', { workspaceId: '…' })
```

## Error responses

| HTTP | code                         | Meaning |
|------|------------------------------|---------|
| 403  | `extension_not_enabled`      | Org hasn't opted in. Hide the surface or surface a "request access" CTA. |
| 503  | `extension_not_configured`   | `FINANCIALS_SUPABASE_URL` not set server-side. Surface as "coming soon". |
| 401  | `unauthorized`               | Missing / invalid bearer. Re-auth. |
