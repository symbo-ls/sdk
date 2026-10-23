# @symbo.ls/analyzing

Browser-side observability SDK for DOMQL / smbls apps. Streams everything the
[`@symbo.ls/analyze`](../../../smbls/plugins/analyze) plugin captures — errors,
console output, network calls, performance, navigation, lifecycle, state — to
the [`analyzed`](../../../server/workers/analyzed) worker, which persists into
Supabase and exposes it for AI-driven session analysis.

Replaces Grafana Faro for symbo.ls apps. Faro-compatible manual API:
`captureError`, `captureMessage`, `identify`, `setContext`, `addMeasurement`.

## Usage

```js
import { create } from 'smbls'
import { createAnalyzing } from '@symbo.ls/analyzing'

const analyzing = createAnalyzing({
  endpoint: 'https://analyzed.symbo.ls/v1/ingest',
  appKey: 'workspace',
  tenantKey: 'symbols-app',
  release: process.env.BUILD_SHA,
  env: 'production',

  // Auth — pick one:
  sdk,                                      // pulls bearer from sdk.tokenManager
  // apiKey: 'sk_…',                        // X-Analyze-Key header
  // getAuth: () => fetchToken(),           // custom resolver

  level: 'info',
  sampleRate: 1,
  redact: [/password/i, /token/i],
  beforeSend: (envelope) => envelope        // scrub or drop
})

create(app, {
  plugins: [analyzing.plugin],
  analyze: analyzing.config
})

// Manual API
analyzing.identify({ userId: 'u_123', traits: { plan: 'pro' } })
analyzing.setContext('feature_flag', 'new-onboarding')
analyzing.setTag('build', 'canary')

try {
  doSomething()
} catch (err) {
  analyzing.captureError(err, { route: '/onboarding' })
}

analyzing.captureMessage('Checkout started', 'info', { cart: 3 })
analyzing.addMeasurement('checkout.tti', 920, 'ms')
```

## Identity and privacy

- `identify()` keeps an **allowlist**: the user id (`userId` or `id`) and
  `traits.plan`. The e-mail, name, username and every other trait are
  dropped. A missing id, or an e-mail where the id should be, leaves the
  session anonymous — there is no fallback to the e-mail.
- `setContext()` refuses personal-data keys (e-mail, phone, address, names,
  IP, tokens …) and e-mail-shaped values, because it writes into the same
  `traits` bag every envelope carries.
- Public mode (`bootAnalyzing`, the published-site tracker) identifies
  nobody on its own. It does not read a site's own login (no
  `sb-*-auth-token` scan). A visitor is the first-party visitor id
  (`smbls_vid`) only; `client.visitorId` returns it (or `null`).

## Public page API — `window.SymbolsAnalytics`

`bootAnalyzing` installs one frozen handle (version 2) on every page the
tracker runs on. Page code is untrusted input:

```js
SymbolsAnalytics.capture('add_to_cart', { productId: 'p1', quantity: 1 })   // → true | false
SymbolsAnalytics.capture('funnel.ask', { surface: 'landing', page: '/', intent: 'crm' })
SymbolsAnalytics.capture('funnel.alias', { from: svid })   // the other origin's visitor id
SymbolsAnalytics.visitorId                                  // this page's visitor id, read-only (or null)
```

- **Names** — an allowlist: the commerce events (`view_item`,
  `add_to_cart`, `begin_checkout`, `purchase`), the sign-up funnel stages a
  client emits (`funnel.ask`, `funnel.answer`, `funnel.blueprint`,
  `funnel.make_real`, `funnel.signup`, `funnel.signup_error`,
  `funnel.workspace_ready`, `funnel.provision_error`) and `funnel.alias`.
  The server-truth stages (`funnel.arrived`, `funnel.activated`,
  `funnel.paid`) and the Fly Worker's `funnel.lead` are refused.
- **Data** — a flat object of scalars: ≤ 16 keys, ≤ 2 KB, strings cut at 200
  chars; nested values dropped; personal-data keys and e-mail-shaped values
  dropped.
- **`funnel.alias`** — exactly `{ from }`: an opaque id (8–64 letters,
  digits, `_`, `-`) that is not the page's own; refused when the page has no
  visitor id; one per page load.
- **Volume** — at most 100 accepted events per page load; the stub's
  pre-boot queue (≤ 50 calls) drains in order into the same session.
- `visitorId` exists only on the real handle (after the bundle loads); read
  it when you need it (a click, a sign-up), not at page load.

## What gets captured

By default, the `remote` preset enables:

| Category    | Notes                                                                   |
|-------------|-------------------------------------------------------------------------|
| errors      | `window.onerror`, `unhandledrejection`, DOMQL lifecycle throws          |
| warnings    | console.warn + sentinel framework warnings                              |
| console     | `log` / `warn` / `error` / `debug` — args safely stringified            |
| performance | LCP, CLS, longtask, paint, first-input, custom measurements             |
| navigation  | router transitions                                                       |
| viewport    | resize, orientationchange, visibilitychange                              |

Opt in via `capture: { … }` overrides. Sensitive categories (`pointer`,
`keyboard`, `forms`, `scroll`) stay **off** in the remote preset by design.

**Network capture** (window.fetch + XMLHttpRequest + smbls fetch plugin
events) is **off by default** — the analyzed server discards un-opted-in
`logType='network'` envelopes at ingest (server `cd64446f`), so shipping them
was wasted client CPU + egress. Re-enable with the same levers the server
honors: `debug: true` (restores traces end-to-end — every envelope stamps
`app.debug`, the server's per-envelope opt-in) or `capture: { network: true }`
/ runtime `setNetworkCapture(true)` (the client half of the per-workspace
`Organization.settings.analyzedNetworkCapture` opt-in).

## Log type classification

Every event is tagged with `log_type` ∈ `bug | network | log | verbose` before
shipping. The server re-runs the classifier on ingest (never trust the client)
but the client hint lets dashboards stream a single column without joins.

| Rule                                       | log_type  |
|--------------------------------------------|-----------|
| `level === 'error'` or `type === 'error'`  | `bug`     |
| `type === 'network'`                       | `network` |
| `type === 'console'` + level ≥ warn        | `bug`     |
| `type === 'console'` + level ≤ info        | `log`     |
| `level === 'warn'`                         | `bug`     |
| `level === 'info'`                         | `log`     |
| else (debug, trace, lifecycle, state, …)   | `verbose` |
