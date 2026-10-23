'use strict'

export {
  createAnalyzing,
  resolveNetworkCapture,
  sanitizeIdentity,
  IDENTITY_TRAIT_KEYS
} from './client.js'
// Public-mode tracker entry — the mermaid track stub dynamic-imports this
// bundle and calls bootAnalyzing(cfg). Missing until 2026-08-14; the stub's
// typeof guard silently dropped ALL published-site visitor analytics.
export { bootAnalyzing } from './boot.js'
// Page-side custom events on the public tracker — `window.SymbolsAnalytics`:
// the commerce events, the sign-up funnel's client stages + funnel.alias, and
// the page's read-only visitor id (fly docs/FUNNEL.md §2).
export {
  PAGE_HANDLE_NAME,
  PAGE_HANDLE_VERSION,
  PAGE_EVENT_NAMES,
  FUNNEL_EVENT_NAMES,
  FUNNEL_ALIAS_EVENT,
  FUNNEL_SERVER_EVENT_NAMES,
  PAGE_ACCEPTED_EVENT_NAMES,
  PAGE_EVENT_LIMITS,
  sanitizePageEventData,
  sanitizeAliasData,
  installPageHandle
} from './pageEvents.js'
// Personal-data rules shared by the page API and identify / setContext.
export {
  isOpaqueId,
  isUserId,
  isPersonalKey,
  looksLikeEmail,
  OPAQUE_ID_RE
} from './privacy.js'
export { LOG_TYPES, classifyEnvelope } from './classify.js'
export { SDK_NAME, SDK_VERSION } from './meta.js'
