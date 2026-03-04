# Feature Flags (SDK)

This document describes how to use **system-level feature flags** via the SDK.

These feature flags are intended for **frontend UI gating**, **beta access**, **gradual rollouts**,
and **A/B testing experiments**.

They are separate from subscription/project feature access checks.

## API mapping

- **User-facing (optional auth)**:
  - `sdk.getFeatureFlags({ keys })` → `GET /feature-flags?keys=...`
  - `sdk.getFeatureFlag(key)` → `GET /feature-flags/:key`
- **Admin (requires admin/owner)**:
  - `sdk.getAdminFeatureFlags({ includeArchived })` → `GET /admin/feature-flags`
  - `sdk.createFeatureFlag(data)` → `POST /admin/feature-flags`
  - `sdk.updateFeatureFlag(id, patch)` → `PATCH /admin/feature-flags/:id`
  - `sdk.archiveFeatureFlag(id)` → `DELETE /admin/feature-flags/:id`

## User-facing usage (frontend reads)

### Evaluate a subset of flags on boot

```js
const { flags } = await sdk.getFeatureFlags({
  keys: ['new_ui', 'checkout_experiment']
})

if (flags.new_ui?.enabled) {
  // show new UI shell
}

if (flags.checkout_experiment?.enabled) {
  const variant = flags.checkout_experiment.variant
  const payload = flags.checkout_experiment.payload
  // route UI based on variant/payload
}
```

### Evaluate a single flag

```js
const result = await sdk.getFeatureFlag('checkout_experiment')
// result: { key, enabled, variant, payload }
```

## Admin usage (CRUD)

All admin methods require a logged-in user with `globalRole: admin` (or `owner`).

### List all flags

```js
const flags = await sdk.getAdminFeatureFlags()
```

Exclude archived:

```js
const flags = await sdk.getAdminFeatureFlags({ includeArchived: false })
```

### Create a flag

```js
const created = await sdk.createFeatureFlag({
  key: 'new_ui',
  description: 'Enable the new UI shell',
  enabled: true,
  status: 'active',
  targeting: { mode: 'all' }
})
```

### Update a flag

```js
const updated = await sdk.updateFeatureFlag(created._id, {
  enabled: false
})
```

### Archive a flag (soft delete)

```js
await sdk.archiveFeatureFlag(created._id)
```

## Scenarios (copy/paste recipes)

### Scenario 1: Kill switch (turn off for everyone immediately)

```js
await sdk.updateFeatureFlag(flagId, { enabled: false })
```

### Scenario 2: All users can access (simple on/off)

```js
await sdk.createFeatureFlag({
  key: 'search_v2',
  enabled: true,
  targeting: { mode: 'all' }
})
```

### Scenario 3: No users can access (keep defined but off)

```js
await sdk.createFeatureFlag({
  key: 'search_v2',
  enabled: true,
  targeting: { mode: 'none' }
})
```

### Scenario 4: Allowlist-only beta (some users)

```js
await sdk.createFeatureFlag({
  key: 'beta_dashboard',
  enabled: true,
  targeting: {
    mode: 'allowlist',
    allowlistUserIds: ['<userObjectId1>', '<userObjectId2>']
  }
})
```

### Scenario 5: Exclude specific users (denylist wins)

```js
await sdk.createFeatureFlag({
  key: 'new_ui',
  enabled: true,
  targeting: {
    mode: 'all',
    denylistUserIds: ['<userObjectIdToExclude>']
  }
})
```

### Scenario 6: Gradual rollout (percentage-based)

```js
await sdk.createFeatureFlag({
  key: 'editor_toolbar_v2',
  enabled: true,
  targeting: { mode: 'percentage', percentage: 10, salt: '2026-02' }
})
```

Ramp up later:

```js
await sdk.updateFeatureFlag(flagId, {
  targeting: { mode: 'percentage', percentage: 25, salt: '2026-02' }
})
```

### Scenario 7: A/B test (variants + percentage enrollment)

```js
await sdk.createFeatureFlag({
  key: 'checkout_experiment',
  description: 'A/B checkout layout',
  enabled: true,
  targeting: { mode: 'percentage', percentage: 50, salt: 'checkout-iter-1' },
  variants: [
    { key: 'A', weight: 1, payload: { ui: 'old' } },
    { key: 'B', weight: 1, payload: { ui: 'new' } }
  ]
})
```

Frontend read:

```js
const { flags } = await sdk.getFeatureFlags({ keys: ['checkout_experiment'] })
const f = flags.checkout_experiment
if (f?.enabled) {
  // f.variant, f.payload
}
```

### Scenario 8: Force a user into the experiment (support/debug)

```js
await sdk.updateFeatureFlag(flagId, {
  targeting: {
    mode: 'percentage',
    percentage: 10,
    salt: 'checkout-iter-1',
    allowlistUserIds: ['<userObjectId>']
  }
})
```

### Scenario 9: “All users get it” but still assign variants

```js
await sdk.createFeatureFlag({
  key: 'nav_experiment',
  enabled: true,
  targeting: { mode: 'all', salt: 'nav-iter-1' },
  variants: [
    { key: 'control', weight: 3, payload: { nav: 'classic' } },
    { key: 'treatment', weight: 1, payload: { nav: 'compact' } }
  ]
})
```

### Scenario 10: Environment isolation (dev/staging/prod)

```js
await sdk.updateFeatureFlag(flagId, {
  targeting: { mode: 'percentage', percentage: 50, salt: 'prod:checkout-iter-1' }
})
```

## Recommended frontend usage pattern

- Fetch feature flags once on app boot (or after login), cache in memory, and pass down to UI.
- Prefer querying a subset via `keys` to reduce payload.
- Implement safe defaults when a flag is missing:
  - treat as `enabled: false`
  - treat `variant` as `null`

