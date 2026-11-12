// `@symbo.ls/sdk/lazy` — the SDK without the static service factories.
//
// Every export of the main entry is here EXCEPT the 74 `createXService`
// factories. A factory is synchronous and returns an instance, so it needs
// its service class in the same bundle; the main entry therefore pulls every
// service into any bundle that imports it — also through a namespace import
// (`import * as sdk`), which keeps every export.
//
// A bundle that imports THIS entry carries only the core services (see
// services/registry.js). With `new SDK({ lazyServices: true })` every other
// service is a separate chunk, loaded on its first call. Without the option
// the SDK behaves exactly as the main entry's: initialize() loads them all.
//
// src/index.js re-exports this file, so the two lists cannot drift
// (lazyServices.test.js checks it).
export { SDK, SDK as default, isLocalhost } from './sdk.js'

export { workspaceProjectBaseUrl } from './services/WorkspaceProjectService.js'

// Persona role enum (server 886a9b27's PERSONA_TARGET_ROLES literal) —
// exported from the MAIN entry for the same reason as PERMISSION_MAP below:
// pickers need a SYNCHRONOUS role list, and every flat sdk.* method returns
// a Promise through the workspace init gate.
export { PERSONA_TARGET_ROLES } from './services/PersonaService.js'

// Re-export entity dispatcher helpers so external packages (e.g. plugins
// extending the fetch adapter) can add their own routes at boot.
export {
  registerEntity,
  createEntityDispatcher
} from './services/EntityDispatcher.js'

// Re-export BaseService so opt-in extension packages (e.g.
// @symbo.ls/sdk-financials) can subclass it without depending on the
// SDK's internal path layout.
export { BaseService } from './services/BaseService.js'

// Export environment configuration
export { default as environment } from './config/environment.js'

// Cross-app auth (SDK-token cookie/iframe session handoff). Exported from the
// MAIN entry so a bundler that does not resolve package.json `exports`
// subpaths still reaches it (the `./cross-app-auth` subpath stays for Node
// consumers that do).
export { createCrossAppAuth, DEFAULT_TOKEN_KEYS } from './crossAppAuth.js'

// Parent-domain cookie primitives. Canonical home is the SDK (moved off the
// Supabase federation package `@symbo.ls/sdk-bridge` on 2026-07-28 — see
// src/cookies.js); that package's last consumer (workspace shared/prefs.js)
// finished migrating to this export (workspace 2230a8ca) and sdk-bridge
// itself is deleted (2026-07-31).
export { parentDomain, readCookie, writeCookie } from './cookies.js'

// Role → permission tables. Exported from the MAIN entry for the same reason
// as above: consumers gate UI on these, and `sdk.hasPermission` is unusable
// for that because the workspace shell wraps every SDK method in an init gate,
// so it returns a Promise and `Boolean(promise)` is always true (workspace
// a0a81ea6). Consumers needing a SYNCHRONOUS permission answer read the table
// directly against an already-resolved role instead of calling the SDK.
export {
  PERMISSION_MAP,
  ROLE_PERMISSIONS,
  PROJECT_ROLE_PERMISSIONS,
  TIER_FEATURES
} from './utils/permission.js'

// Tier-lock refusals (HTTP 402). Exported from the MAIN entry because every
// upsell in every consumer needs it: it turns a rejected tier-gated call into
// the fields the SERVER named (`tier`, `requiredTier`, `requiredTierName`),
// so no client ever hardcodes a tier name to decide what to offer.
export { readTierLock, isTierLocked } from './utils/tierLock.js'
