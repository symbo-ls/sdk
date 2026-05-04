// Project-config helpers + registry factory. Project-specific
// (governance, financials) defaults live in the consumer app —
// @symbo.ls/sdk-bridge-governance for the Symbols intranet, your own
// package for any other deployment. This module only handles the shape:
// take a list of project descriptors with optional fallbacks, read env
// vars by convention, return the populated registry.

const env = (key) => {
  try { return (typeof process !== 'undefined' && process.env && process.env[key]) || '' }
  catch { return '' }
}

// Resolve a single project from env.
// Convention: SYMBOLS_APP_<KEY>_SUPABASE_{URL,ANON_KEY,ANON_JWT,BRIDGE_URL}.
// Override the prefix via opts.envPrefix when integrating with non-Symbols
// apps (e.g. consumer reads MYAPP_<KEY>_SUPABASE_URL instead).
export function readProject (key, opts = {}) {
  const envPrefix = opts.envPrefix || 'SYMBOLS_APP'
  const prefix = `${envPrefix}_${key.toUpperCase()}_SUPABASE`
  const url = env(`${prefix}_URL`) || opts.fallback?.url || ''
  const anonKey = env(`${prefix}_ANON_KEY`) || opts.fallback?.anonKey || ''
  const anonJwt = env(`${prefix}_ANON_JWT`) || opts.fallback?.anonJwt || anonKey
  const bridgeUrl = env(`${prefix}_BRIDGE_URL`) || (url ? `${url}/functions/v1/symbols-auth-bridge` : '')
  if (!url || !anonKey) return null
  return {
    key,
    url,
    anonKey,
    anonJwt,                           // JWT form used for realtime websocket auth
    bridgeUrl,
    required: opts.required,
    accessTokenTTL: opts.accessTokenTTL ?? 600,
    refreshTokenTTL: opts.refreshTokenTTL ?? 86400,
    roleGate: opts.roleGate || null,
    // Predicate — evaluated AFTER required projects finish. If returns
    // false, this extension's bridge is never called. Default true.
    shouldActivate: opts.shouldActivate || (() => true)
  }
}

// Build a registry-shaped object from a list of `{ key, opts }` entries.
// Projects whose env vars are absent AND have no fallback are silently
// omitted — a non-required extension that isn't configured is skipped at
// runtime, not an error. Order is preserved.
export function buildRegistryConfig (descriptors = []) {
  const out = {}
  for (const d of descriptors) {
    if (!d || !d.key) continue
    const cfg = readProject(d.key, d.opts || {})
    if (cfg) out[d.key] = cfg
  }
  return out
}

// App-level configuration. Each consumer (workspace-project, canvas, ...)
// declares which projects it REQUIRES for core UX vs which are OPTIONAL
// extensions that activate on demand. Decouples "required" from the
// project itself — governance is required for workspace-project, but
// only optional for canvas (canvas runs on pure SDK auth; chat/meet
// embed activates governance lazily).
//
// Defaults preserve current behavior: projects declared `required: true`
// in the registry are treated as required; everything else optional.
export function createAppConfig (registryGetter) {
  let _override = null

  const configure = ({ required, optional } = {}) => {
    _override = {
      required: Array.isArray(required) ? [...required] : null,
      optional: Array.isArray(optional) ? [...optional] : null
    }
  }

  const get = () => {
    if (_override) return _override
    const reg = registryGetter()
    const required = []
    const optional = []
    for (const [key, cfg] of Object.entries(reg)) {
      if (cfg.required) required.push(key)
      else optional.push(key)
    }
    return { required, optional }
  }

  return { configure, get }
}
