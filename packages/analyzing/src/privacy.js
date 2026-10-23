'use strict'

// Personal-data rules shared by the public page API (pageEvents.js) and the
// client's identity surface (client.js — identify / setContext).
//
// The Symbols sign-up funnel contract (fly docs/FUNNEL.md §2 "Privacy",
// binding): events and identity carry no e-mail, name, phone, IP or free
// text, and ids are random. Everything a page or a caller hands this package
// is untrusted input, so these checks run in the browser BEFORE anything is
// queued; the server applies its own allowlist and redaction on ingest too.

// Keys that name personal data. Dropped even when the value looks harmless.
export const PERSONAL_KEY_RE =
  /e-?mail|phone|mobile|address|street|zip|postcode|password|passwd|token|secret|card|iban|passport|birth|contact|customer_?name|full_?name|first_?name|last_?name|surname|user_?name|display_?name|nick_?name|^name$|^ip(_?addr)?$/i

// An e-mail address anywhere inside a string value.
export const EMAIL_VALUE_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/

export const isPersonalKey = (key) =>
  typeof key === 'string' && PERSONAL_KEY_RE.test(key)

export const looksLikeEmail = (value) =>
  typeof value === 'string' && EMAIL_VALUE_RE.test(value)

// An opaque random id — a visitor id (`smbls_vid`): 8–64 letters, digits,
// '_' or '-', starting with a letter or a digit. crypto.randomUUID (36
// chars) and the client's fallback mint both fit; an e-mail, a URL, a name
// or free text never does.
export const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/

export const isOpaqueId = (value) =>
  typeof value === 'string' && OPAQUE_ID_RE.test(value)

// A user id — the platform's own record id (an ObjectId, a UUID, a prefixed
// id): at most 128 chars, no '@' and no whitespace, so an e-mail is never a
// user id.
export const USER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/

export const isUserId = (value) =>
  typeof value === 'string' && USER_ID_RE.test(value)
