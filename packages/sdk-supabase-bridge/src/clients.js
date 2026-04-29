// Supabase client builder. Factory consumed by createRegistry to mint a
// project-keyed cache. Identical wiring to a hand-rolled createClient
// call but keeps realtime token in sync with auth-js refreshes — without
// it, long-lived tabs hit InvalidJWTToken on realtime channels because
// the socket holds the initial token while auth-js rotates silently.

import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient (cfg) {
  if (!cfg) throw new Error('createSupabaseClient: config required')
  if (!cfg.url) throw new Error('createSupabaseClient: url required')
  const apiKey = cfg.anonJwt || cfg.anonKey
  if (!apiKey) throw new Error('createSupabaseClient: anonJwt or anonKey required')

  const client = createClient(cfg.url, apiKey, {
    realtime: { params: { eventsPerSecond: 20 } },
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
