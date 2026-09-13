import dotenv from 'dotenv'

// Local-dev convenience: load `.env` if present. CI sources its env from
// Infisical via the npm `_inf` wrapper, so .env is absent in CI — that's fine,
// dotenv.config() is a no-op then.
dotenv.config()

// Resolve the test target env. NODE_ENV is the canonical source (set by the
// `infisical run --env=...` wrapper or by the workflow's `env:` block).
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

// The guest account the suite logs in as. The server's
// scripts/provision-guest-test-account.mjs creates it in each env with this
// fixed email and that env's Infisical GUEST_PASSWORD. Infisical holds only
// the password, so without this default GUEST_USER is empty in CI and every
// login answers 400 "Missing credentials". An explicit GUEST_USER still wins.
if (!process.env.GUEST_USER) {
  process.env.GUEST_USER = 'allen+testaccount@symbols.app'
}
