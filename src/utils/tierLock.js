// Tier-lock refusals — the ONE way a client reads "this needs a higher plan".
//
// The server refuses a tier-gated route with HTTP 402 and a structured body
// (`src/core/middleware/tierGuards.js`):
//
//   capability_locked   { error, capability, tier, requiredTier,
//                         requiredTierName, message }
//   environment_locked  { error, envKey, tier, message }
//   branch_mode_locked  { error, envKey, tier, message }
//
// and services throw their own 402s in the same spirit (e.g.
// `CustomDomainService` → `tier_locked`).
//
// `BaseService._request` turns any non-2xx into an Error carrying `.status`
// and `.cause` = the parsed body, so the fields above are already on the
// error — they are just buried. Every caller digging into `err.cause.tier`
// by hand is how a client ends up hardcoding a tier NAME, which is a pricing
// rename away from telling the user to buy a plan that no longer exists.
//
// Read the refusal, render what the server named, decide nothing locally.

const TIER_LOCK_ERRORS = new Set([
  'capability_locked',
  'environment_locked',
  'branch_mode_locked',
  'tier_locked'
])

/**
 * Read a tier-lock refusal off a rejected SDK call.
 *
 * @param {any} err The error a tier-gated SDK method rejected with.
 * @returns {null | {
 *   error: string,
 *   capability: string|null,
 *   envKey: string|null,
 *   tier: string|null,
 *   requiredTier: string|null,
 *   requiredTierName: string|null,
 *   message: string
 * }} null when `err` is not a tier lock — callers must handle it as a normal
 *    failure, never as an upsell.
 */
export const readTierLock = (err) => {
  if (!err) return null
  const body = (err.cause && typeof err.cause === 'object' ? err.cause : null) || null
  const code = body?.error || null
  // A 402 IS the tier plane — honour it even if a future refusal adds a code
  // this list doesn't know yet, so a new gate degrades to "upsell", not to a
  // raw error string in the UI.
  const is402 = err.status === 402
  if (!is402 && !(code && TIER_LOCK_ERRORS.has(code))) return null

  return {
    error: code || 'tier_locked',
    capability: body?.capability ?? null,
    envKey: body?.envKey ?? null,
    tier: body?.tier ?? null,
    requiredTier: body?.requiredTier ?? null,
    requiredTierName: body?.requiredTierName ?? null,
    message: body?.message || err.message || 'This feature needs a higher plan.'
  }
}

/** True when a rejected SDK call was refused for tier reasons. */
export const isTierLocked = (err) => readTierLock(err) !== null

export default readTierLock
