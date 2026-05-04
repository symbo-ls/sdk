// Parent-domain-scoped cookie helpers. Browser-only. Used by cross-app
// auth sync, shared user-prefs, and any cross-tab/cross-subdomain feature
// that needs a tabular handoff.

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
