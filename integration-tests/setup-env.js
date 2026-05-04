import dotenv from 'dotenv'

// Local-dev convenience: load `.env` if present. CI sources its env from
// Infisical via the npm `_inf` wrapper, so .env is absent in CI — that's fine,
// dotenv.config() is a no-op then.
dotenv.config()

// Resolve the test target env. NODE_ENV is the canonical source (set by the
// `infisical run --env=...` wrapper or by the workflow's `env:` block).
// SYMBOLS_APP_ENV is honored if explicitly set (e.g. for local overrides), but
// otherwise we DO NOT default it — defaulting to 'testing' here used to silently
// override NODE_ENV via environment.js's `SYMBOLS_APP_ENV || NODE_ENV` resolution,
// which routed the SDK at the wrong API host (e.g. test.api when NODE_ENV=upcoming).
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

if (!process.env.SYMBOLS_APP_ENV) {
  process.env.SYMBOLS_APP_ENV = process.env.NODE_ENV
}
