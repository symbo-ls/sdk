// Parent-domain-scoped cookie helpers. Browser-only. Used by cross-app
// auth sync, shared user-prefs, and any cross-tab/cross-subdomain feature
// that needs a tabular handoff.
//
// Canonical home as of 2026-07-28. Previously lived in
// `@symbo.ls/sdk-bridge` — the Supabase multi-project federation layer,
// which is deprecated and being retired along with the Supabase plane.
// These three functions are backend-agnostic browser primitives with no
// federation ties; they were only parked in that package. Keeping them
// there forced `@symbo.ls/sdk`'s MAIN entry to statically import a
// deprecated package through `crossAppAuth.js`, which meant importing
// the SDK at all required a peer dependency that nothing installs —
// sdk's own smoke tests died on ERR_MODULE_NOT_FOUND.
//
// `@symbo.ls/sdk-bridge` keeps its own copy for its remaining consumers
// (workspace `shared/prefs.js`, governance `finance-features`) until
// those migrate to importing from `@symbo.ls/sdk`. sdk-bridge cannot
// re-export from here — it must not depend on the SDK.

export function parentDomain (hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  if (!hostname) return null
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return '.localhost'
  if (hostname.endsWith('.symbols.app')) return '.symbols.app'
  return null
}

export function readCookie (name) {
  if (typeof document === 'undefined') return null
  const prefix = name + '='
  for (const p of document.cookie.split(';')) {
    const c = p.trim()
    if (!c.startsWith(prefix)) continue
    try { return decodeURIComponent(c.slice(prefix.length)) } catch { return null }
  }
  return null
}

export function writeCookie (name, value, maxAge) {
  if (typeof document === 'undefined') return
  const domain = parentDomain(window.location.hostname)
  const encoded = value == null ? '' : encodeURIComponent(String(value))
  const age = value == null ? 0 : maxAge
  const attrs = [`${name}=${encoded}`, 'path=/', `max-age=${age}`, 'SameSite=Lax']
  if (domain) attrs.push(`domain=${domain}`)
  if (window.location.protocol === 'https:') attrs.push('Secure')
  document.cookie = attrs.join('; ')
}
