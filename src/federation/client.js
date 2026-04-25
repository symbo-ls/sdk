import { createClient } from '@supabase/supabase-js'

// Build a single Supabase client. Public so callers that need an
// off-registry client (one-off integration test, ad-hoc CLI tool) can
// use the same realtime/auth wiring without re-implementing it.
export function createSupabaseClient(cfg) {
  if (!cfg) throw new Error('createSupabaseClient: config required')
  if (!cfg.url) throw new Error('createSupabaseClient: url required')
  const apiKey = cfg.anonJwt || cfg.anonKey
  if (!apiKey) throw new Error('createSupabaseClient: anonJwt or anonKey required')

  const client = createClient(cfg.url, apiKey, {
    realtime: { params: { eventsPerSecond: 20 } },
    auth: { persistSession: true, autoRefreshToken: true },
  })

  // Keep realtime websocket auth in sync with auth-js' token refresh.
  // Without this, long-lived tabs eventually hit InvalidJWTToken on
  // realtime channels because the socket holds the initial token while
  // auth-js rotates it silently.
  client.auth.onAuthStateChange((_event, session) => {
    try {
      client.realtime.setAuth(session?.access_token || cfg.anonJwt || cfg.anonKey)
    } catch (err) {
      console.error(`[sdk/federation] realtime.setAuth failed on ${cfg.key}:`, err)
    }
  })

  return client
}
