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

## What gets captured

By default, the `remote` preset enables:

| Category    | Notes                                                                   |
|-------------|-------------------------------------------------------------------------|
| errors      | `window.onerror`, `unhandledrejection`, DOMQL lifecycle throws          |
| warnings    | console.warn + sentinel framework warnings                              |
| console     | `log` / `warn` / `error` / `debug` — args safely stringified            |
| network     | window.fetch + XMLHttpRequest + smbls fetch plugin events               |
| performance | LCP, CLS, longtask, paint, first-input, custom measurements             |
| navigation  | router transitions                                                       |
| viewport    | resize, orientationchange, visibilitychange                              |

Opt in via `capture: { … }` overrides. Sensitive categories (`pointer`,
`keyboard`, `forms`, `scroll`) stay **off** in the remote preset by design.

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
