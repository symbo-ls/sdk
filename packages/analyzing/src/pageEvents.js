// Page-side custom events for the PUBLIC tracker (mermaid's /v1/track.js).
//
// WHY: a published site's tracker (bootAnalyzing, public mode) records page
// views, errors and the visit itself, but it handed the page no way to add
// its own events — bootAnalyzing kept the client to itself. A shop needs its
// e-commerce funnel (view_item → add_to_cart → begin_checkout → purchase) in
// the SAME visitor session as those page views, or visits and conversion can
// never be joined (Shaker program CONTRACT §8, 2026-10-17).
//
// WHAT: one frozen global, `window.SymbolsAnalytics`, with a single method:
//
//   SymbolsAnalytics.capture(name, data)          → true | false
//   SymbolsAnalytics.capture('info', name, data)  → same (the client's own
//                                                   capture(level, msg, data)
//                                                   shape; the level is
//                                                   IGNORED — always 'info')
//
// The event rides the tracker's own client: same session id, same visitor
// stamp, same batching, and the same same-origin POST to /v1/analytics/ingest
// (no new endpoint, no CORS). It is stored like the tracker's page_view — a
// `manual` event whose message is the event name and whose payload carries
// `data`.
//
// SAFE BY CONSTRUCTION — page code is untrusted input here:
//   - names: an ALLOWLIST (PAGE_EVENT_NAMES); anything else is refused;
//   - data: a FLAT object of scalars (string ≤ 200 chars, finite number,
//     boolean, null); nested objects/arrays/functions are dropped; keys must
//     look like identifiers; personal-data keys (e-mail, phone, address,
//     names of people, passwords, tokens, cards…) are DROPPED, never sent;
//     more than 16 keys, or more than 2 KB serialized, refuses the event;
//   - volume: at most 100 accepted page events per page load;
//   - the queue the track.js stub keeps before this module loads is drained
//     once, at most 50 calls, in order.
// The analyze pipeline's own redaction still runs after this (redact.js).

export const PAGE_HANDLE_NAME = 'SymbolsAnalytics'

export const PAGE_EVENT_NAMES = Object.freeze([
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'purchase'
])

export const PAGE_EVENT_LIMITS = Object.freeze({
  maxKeys: 16,
  maxStringLength: 200,
  maxBytes: 2048,
  maxEventsPerPage: 100,
  maxQueued: 50
})

const LEVEL_NAMES = new Set(['error', 'warn', 'info', 'debug', 'trace'])
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
// Keys that name personal data. A page must never send them; they are dropped
// even when the value looks harmless.
const PERSONAL_KEY_RE =
  /e-?mail|phone|mobile|address|street|zip|postcode|password|passwd|token|secret|card|iban|passport|birth|contact|customer_?name|full_?name|first_?name|last_?name|surname|^name$/i

/**
 * The allowlisted copy of a page event's data, or null when it is refused.
 * `undefined` / `null` → `{}` (an event with no data is fine).
 */
export const sanitizePageEventData = (data) => {
  if (data == null) return {}
  if (typeof data !== 'object' || Array.isArray(data)) return null
  const out = {}
  let kept = 0
  for (const key of Object.keys(data)) {
    if (!KEY_RE.test(key) || PERSONAL_KEY_RE.test(key)) continue
    const value = data[key]
    let clean
    if (value === null || typeof value === 'boolean') clean = value
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
      clean = value
    } else if (typeof value === 'string') {
      clean = value.slice(0, PAGE_EVENT_LIMITS.maxStringLength)
    } else continue // objects, arrays, functions, symbols, bigints
    kept += 1
    if (kept > PAGE_EVENT_LIMITS.maxKeys) return null
    out[key] = clean
  }
  let size = 0
  try {
    size = JSON.stringify(out).length
  } catch {
    return null
  }
  return size > PAGE_EVENT_LIMITS.maxBytes ? null : out
}

/**
 * Install `window.SymbolsAnalytics` over a booted public client and drain the
 * stub's pre-boot queue. Returns the handle, or null when there is no window
 * or no client. Idempotent per client: a second call returns a fresh handle
 * over the same client (bootAnalyzing itself only runs once).
 */
export const installPageHandle = (client, { win } = {}) => {
  const target = win || (typeof window !== 'undefined' ? window : null)
  if (!target || !client || typeof client.capture !== 'function') return null

  let accepted = 0
  const capture = (a, b, c) => {
    // capture(name, data) — or the client's own capture(level, name, data).
    let name = a
    let data = b
    if (typeof a === 'string' && LEVEL_NAMES.has(a) && typeof b === 'string') {
      name = b
      data = c
    }
    if (typeof name !== 'string' || !PAGE_EVENT_NAMES.includes(name)) return false
    if (accepted >= PAGE_EVENT_LIMITS.maxEventsPerPage) return false
    const clean = sanitizePageEventData(data)
    if (!clean) return false
    try {
      client.capture('info', name, clean)
    } catch {
      return false
    }
    accepted += 1
    return true
  }

  const handle = Object.freeze({ version: 1, events: PAGE_EVENT_NAMES, capture })
  const previous = target[PAGE_HANDLE_NAME]
  const queued =
    previous && Array.isArray(previous.q) ? previous.q.slice(0, PAGE_EVENT_LIMITS.maxQueued) : []
  try {
    target[PAGE_HANDLE_NAME] = handle
  } catch {
    return null
  }
  for (const args of queued) {
    try {
      if (Array.isArray(args)) capture(...args)
    } catch {}
  }
  return handle
}
