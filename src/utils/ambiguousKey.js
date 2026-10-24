/**
 * A bare project key can name several owners' projects. The server's 1-seg
 * by-key routes answer such a key 409 `{ error: 'ambiguous_key', candidates:
 * [{ owner, key }] }` (server 736d2d755) — they never pick one, and neither
 * does the SDK. This turns that answer into ONE error shape every key method
 * throws, so a caller can show the candidates and let the user choose:
 *
 *   err.code === 'ambiguous_key', err.status === 409,
 *   err.key (the bare key), err.candidates ([{ owner, key }])
 *
 * BaseService wraps an HTTP error once (`Request failed: …`) and keeps the
 * JSON body as the inner error's `cause`; this reads at most three levels.
 *
 * @param {unknown} error - what `_request` (or a wrapper of it) threw
 * @param {string | { owner?: string, key: string }} keyOrSpec - the lookup input
 * @returns {Error | null} the structured error, or null for any other failure
 */
export function ambiguousKeyError (error, keyOrSpec) {
  let body = null
  let node = error
  for (let depth = 0; node && depth < 4; depth++) {
    if (
      node &&
      typeof node === 'object' &&
      !(node instanceof Error) &&
      node.error === 'ambiguous_key'
    ) {
      body = node
      break
    }
    if (node instanceof Error && node.code === 'ambiguous_key') return node
    node = node.cause
  }
  if (!body) return null
  const key =
    keyOrSpec && typeof keyOrSpec === 'object' ? keyOrSpec.key : keyOrSpec
  const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
    .filter((c) => c && c.owner && c.key)
    .map((c) => ({ owner: c.owner, key: c.key }))
  const names = candidates.map((c) => `${c.owner}/${c.key}`).join(', ')
  const err = new Error(
    `Project key '${key}' names more than one project${
      names ? `: ${names}` : ''
    } — pass { owner, key }`,
    { cause: error }
  )
  err.code = 'ambiguous_key'
  err.status = 409
  err.key = key
  err.candidates = candidates
  return err
}
