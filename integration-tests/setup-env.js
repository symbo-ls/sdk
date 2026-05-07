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
