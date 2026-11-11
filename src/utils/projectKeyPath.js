/**
 * Normalize a project-key lookup input to a URL path segment.
 *
 * Post-§45 the canonical project identity is `(owner, key)` — two
 * owners can legitimately share the same bare key. Callers that know
 * the owner should pass `{ owner, key }` to hit the collision-safe
 * 2-seg route. A bare string (no `/`) hits the legacy 1-seg route and
 * may return 409 `ambiguous_key` when the server detects a collision.
 *
 * An `owner/key` string (exactly one `/`, both sides non-empty — the
 * form symbols.json, the CLI and the docs name a project by) is the
 * 2-seg route too: each segment is encoded on its own, so the slash
 * stays a path separator. Encoding the whole string made it ONE `%2F`
 * segment, so the request took the 1-seg route, which has no owner and
 * matches only a key equal to the whole string or a migrated
 * previousProjectKey: every project created after §45 came back 404
 * (2026-11-09, `plait/controls-app` right after its create). The CLI's
 * getProjectByKey (smbls/packages/cli/helpers/projectsApi.js) splits
 * the same way. Any other string (more than one `/`, an empty side) is
 * encoded whole, as before: a 3-segment path would reach another route
 * (`/key/:owner/:projectSlug/role`).
 *
 * @param {string | { owner?: string, key: string }} input
 * @returns {string} URL path suffix like `owner/key` or `key`
 * @throws {Error} when input is missing required `key`
 */
export function projectKeyPath (input) {
  if (input && typeof input === 'object') {
    const { owner, key } = input
    if (!key) throw new Error('Project key is required')
    if (owner) return `${encodeURIComponent(owner)}/${encodeURIComponent(key)}`
    return encodeURIComponent(key)
  }
  if (!input) throw new Error('Project key is required')
  const s = String(input)
  const slash = s.indexOf('/')
  if (slash > 0 && slash < s.length - 1 && s.indexOf('/', slash + 1) === -1) {
    return `${encodeURIComponent(s.slice(0, slash))}/${encodeURIComponent(s.slice(slash + 1))}`
  }
  return encodeURIComponent(s)
}
