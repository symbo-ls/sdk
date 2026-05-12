// Supabase client builder. Factory consumed by createRegistry to mint a
// project-keyed cache. Identical wiring to a hand-rolled createClient
// call but keeps realtime token in sync with auth-js refreshes — without
// it, long-lived tabs hit InvalidJWTToken on realtime channels because
// the socket holds the initial token while auth-js rotates silently.

import { createClient } from '@supabase/supabase-js'

// Resolve the browser's native WebSocket constructor LAZILY (inside the
// factory, not at module top-level) so we can hand it to supabase-js's
// realtime client. supabase-realtime-js v2.105+ ships an
// environment-detector that mis-fires in some bundled contexts (Parcel
// + Vite) — when `process.versions.node` is polyfilled but the global
// `WebSocket` reference isn't visible from the realtime module's scope,
// detectEnvironment falls through to the Node.js branch and throws
// "Node.js 20 detected without native WebSocket support", crashing the
// whole client init even for REST-only callers. Passing `transport`
// explicitly bypasses detection.
//
// CRITICAL: lazy resolution. A previous incarnation captured this as a
// module-top-level `const _nativeWS = ... || null`, which Parcel
// statically evaluated AT BUILD TIME in a Node context (where
// `WebSocket` is undefined and `globalThis.WebSocket` is undefined) →
// baked `_nativeWS = null` into the bundle → the spread evaluated to
// `{}` at compile → transport was permanently absent from the deployed
// bundle even on browser surfaces. Calling this function at runtime
// reads the LIVE browser globals, sidestepping that build-time fold.
const _resolveNativeWS = () =>
  (typeof WebSocket !== 'undefined' && WebSocket) ||
  (typeof globalThis !== 'undefined' && globalThis.WebSocket) ||
  null

export function createSupabaseClient (cfg) {
  if (!cfg) throw new Error('createSupabaseClient: config required')
  if (!cfg.url) throw new Error('createSupabaseClient: url required')
  const apiKey = cfg.anonJwt || cfg.anonKey
  if (!apiKey) throw new Error('createSupabaseClient: anonJwt or anonKey required')

  const nativeWS = _resolveNativeWS()
  const client = createClient(cfg.url, apiKey, {
    realtime: {
      params: { eventsPerSecond: 20 },
      ...(nativeWS ? { transport: nativeWS } : {})
    },
    auth: { persistSession: true, autoRefreshToken: true }
  })

  client.auth.onAuthStateChange((_event, session) => {
    try {
      client.realtime.setAuth(session?.access_token || cfg.anonJwt || cfg.anonKey)
    } catch (err) {
      console.error(`[sdk-supabase-bridge] realtime.setAuth failed on ${cfg.key}:`, err)
    }
  })

  return client
}
