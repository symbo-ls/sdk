// Page-side custom events for the PUBLIC tracker (mermaid's /v1/track.js).
//
// WHY: a published site's tracker (bootAnalyzing, public mode) records page
// views, errors and the visit itself, but it handed the page no way to add
// its own events — bootAnalyzing kept the client to itself. A shop needs its
// e-commerce funnel (view_item → add_to_cart → begin_checkout → purchase) in
// the SAME visitor session as those page views, or visits and conversion can
// never be joined (Shaker program CONTRACT §8, 2026-10-17). The Symbols
// sign-up funnel needs the same for its client stages (fly docs/FUNNEL.md §2,
// 2026-10-24): the landing and Fly emit funnel.ask … funnel.provision_error,
// and Fly links its own visitor id to the landing's with funnel.alias.
//
// WHAT: one frozen global, `window.SymbolsAnalytics` (version 2):
//
//   SymbolsAnalytics.capture(name, data)          → true | false
//   SymbolsAnalytics.capture('info', name, data)  → same (the client's own
//                                                   capture(level, msg, data)
//                                                   shape; the level is
//                                                   IGNORED — always 'info')
//   SymbolsAnalytics.visitorId                    → this page's own visitor
//                                                   id (`smbls_vid`, per
//                                                   origin) or null — READ-
//                                                   ONLY. Fly sends it as the
//                                                   sign-up's
//                                                   `acquisition.visitor`; the
//                                                   landing passes it on links
//                                                   to Fly as `svid`.
//   SymbolsAnalytics.events                       → every accepted name
//   SymbolsAnalytics.version                      → 2 (1 = commerce only, no
//                                                   visitorId)
//
// The event rides the tracker's own client: same session id, same visitor
// stamp, same batching, and the same same-origin POST to /v1/analytics/ingest
// (no new endpoint, no CORS). It is stored like the tracker's page_view — a
// `manual` event whose message is the event name and whose payload carries
// `data`.
//
// SAFE BY CONSTRUCTION — page code is untrusted input here:
//   - names: an ALLOWLIST (PAGE_ACCEPTED_EVENT_NAMES) — the commerce events,
//     the funnel stages a CLIENT emits and funnel.alias; anything else is
//     refused, including the stages only the server may record
//     (FUNNEL_SERVER_EVENT_NAMES: arrived, activated, paid — "server truth" —
//     and the Fly Worker's lead), so a page cannot forge them;
//   - data: a FLAT object of scalars (string ≤ 200 chars, finite number,
//     boolean, null); nested objects/arrays/functions are dropped; keys must
//     look like identifiers; personal-data keys (e-mail, phone, address,
//     names of people, IP, passwords, tokens, cards…) and e-mail-shaped
//     values are DROPPED, never sent; more than 16 keys, or more than 2 KB
//     serialized, refuses the event;
//   - funnel.alias carries exactly `{ from }` — the OTHER origin's visitor id
//     (the landing's `svid`), an opaque id (isOpaqueId) that is not this
//     page's own; it is refused when this page has no visitor id, and only
//     one is accepted per page load;
//   - volume: at most 100 accepted page events per page load;
//   - the queue the track.js stub keeps before this module loads is drained
//     once, at most 50 calls, in order.
// The analyze pipeline's own redaction still runs after this (redact.js).

import { isPersonalKey, looksLikeEmail, isOpaqueId } from './privacy.js'

export { isOpaqueId }

export const PAGE_HANDLE_NAME = 'SymbolsAnalytics'

// 2 — the sign-up funnel events, funnel.alias and `visitorId` (2026-10-24).
export const PAGE_HANDLE_VERSION = 2

// The commerce events (Shaker program CONTRACT §8).
export const PAGE_EVENT_NAMES = Object.freeze([
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'purchase'
])

// The sign-up funnel stages a CLIENT emits (fly docs/FUNNEL.md §2, the rows
// whose emitter is the Fly client), in funnel order. F5 / F6 also have a
// server-truth half; the server records that one itself.
export const FUNNEL_EVENT_NAMES = Object.freeze([
  'funnel.ask', // F1 — first ask: surface (landing | fly), page, intent
  'funnel.answer', // F2 — latency ms, page kind
  'funnel.blueprint', // F3 — pieces, industry, plan
  'funnel.make_real', // F4 — the account form shown: pieces, plan
  'funnel.signup', // F5 — method
  'funnel.signup_error', // F5 — method, error code
  'funnel.workspace_ready', // F6 — steps ok
  'funnel.provision_error' // F6 — failed step
])

// Links this origin's visitor id to another origin's (FUNNEL.md §2
// "Identity": the landing's `svid` on a Fly link).
export const FUNNEL_ALIAS_EVENT = 'funnel.alias'

// Stages only the server (F7 arrived, F8 activated, F9 paid — "server
// truth") or the Fly Worker (a consented lead) may record. A page sending
// them is refused.
export const FUNNEL_SERVER_EVENT_NAMES = Object.freeze([
  'funnel.arrived',
  'funnel.activated',
  'funnel.paid',
  'funnel.lead'
])

// Every name the page API accepts.
export const PAGE_ACCEPTED_EVENT_NAMES = Object.freeze([
  ...PAGE_EVENT_NAMES,
  ...FUNNEL_EVENT_NAMES,
  FUNNEL_ALIAS_EVENT
])

export const PAGE_EVENT_LIMITS = Object.freeze({
  maxKeys: 16,
  maxStringLength: 200,
  maxBytes: 2048,
  maxEventsPerPage: 100,
  maxQueued: 50,
  maxAliasPerPage: 1
})

const ACCEPTED = new Set(PAGE_ACCEPTED_EVENT_NAMES)
const LEVEL_NAMES = new Set(['error', 'warn', 'info', 'debug', 'trace'])
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

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
    if (!KEY_RE.test(key) || isPersonalKey(key)) continue
    const value = data[key]
    let clean
    if (value === null || typeof value === 'boolean') clean = value
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
      clean = value
    } else if (typeof value === 'string') {
      if (looksLikeEmail(value)) continue // personal data under any key
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
 * funnel.alias data: exactly `{ from }`, or null when it is refused — `from`
 * must be an opaque id (isOpaqueId) other than this page's own, and this page
 * must have a visitor id of its own (there is nothing to link otherwise).
 */
export const sanitizeAliasData = (data, ownVisitorId) => {
  if (!isOpaqueId(ownVisitorId)) return null
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const from = data.from
  if (!isOpaqueId(from) || from === ownVisitorId) return null
  return { from }
}

// The client's visitor id when it is an opaque id, else null. The real
// client exposes it as a getter (createAnalyzing → visitorId).
const _visitorIdOf = (client) => {
  try {
    const id = client.visitorId
    return isOpaqueId(id) ? id : null
  } catch {
    return null
  }
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

  // The visitor id does not change during a page load (a session rotation
  // changes the session, never the visitor), so the handle carries it as a
  // plain frozen value.
  const visitorId = _visitorIdOf(client)

  let accepted = 0
  let aliases = 0
  const capture = (a, b, c) => {
    // capture(name, data) — or the client's own capture(level, name, data).
    let name = a
    let data = b
    if (typeof a === 'string' && LEVEL_NAMES.has(a) && typeof b === 'string') {
      name = b
      data = c
    }
    if (typeof name !== 'string' || !ACCEPTED.has(name)) return false
    if (accepted >= PAGE_EVENT_LIMITS.maxEventsPerPage) return false
    const isAlias = name === FUNNEL_ALIAS_EVENT
    if (isAlias && aliases >= PAGE_EVENT_LIMITS.maxAliasPerPage) return false
    const clean = isAlias
      ? sanitizeAliasData(data, visitorId)
      : sanitizePageEventData(data)
    if (!clean) return false
    try {
      client.capture('info', name, clean)
    } catch {
      return false
    }
    accepted += 1
    if (isAlias) aliases += 1
    return true
  }

  const handle = Object.freeze({
    version: PAGE_HANDLE_VERSION,
    events: PAGE_ACCEPTED_EVENT_NAMES,
    visitorId,
    capture
  })
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
