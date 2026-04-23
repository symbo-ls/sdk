/**
 * Normalize a project-key lookup input to a URL path segment.
 *
 * Post-§45 the canonical project identity is `(owner, key)` — two
 * owners can legitimately share the same bare key. Callers that know
 * the owner should pass `{ owner, key }` to hit the collision-safe
 * 2-seg route. A bare string hits the legacy 1-seg route and may
 * return 409 `ambiguous_key` when the server detects a collision.
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
  return encodeURIComponent(String(input))
}
