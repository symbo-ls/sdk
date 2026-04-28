// Supabase fetch-adapter for the workspace-project wrapper. Frontend
// MUST NOT know whether a tenant table is backed by Supabase or Mongo;
// every call goes through `sdk.execute(entity, op, args)` and dispatch
// resolves here when the entity is Supabase-backed. URL composition
// (`/workspace-project/sb`) and the REST-vs-realtime split (raw WS
// endpoint, wrapper-proxied REST) are SDK-internal.

import { createClient } from '@supabase/supabase-js'
import { workspaceProjectBaseUrl } from './WorkspaceProjectService.js'

// supabase-js writes the persisted session under `sb-<project-ref>-auth-token`.
// The wrapper extracts `workspace_id` from this JWT to scope RLS — the
// Symbols SDK's own token doesn't carry that claim. Returns null when no
// session is present so the wrapper can answer with a clear 401.
const _readToken = (storageKey) => {
  if (!storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.access_token || parsed?.currentSession?.access_token || null
  } catch {
    return null
  }
}

const _supabaseStorageKey = (rawSupabaseUrl) => {
  const ref = rawSupabaseUrl?.split('//')[1]?.split('.')[0]
  return ref ? `sb-${ref}-auth-token` : null
}

// Public — single source of truth for "is the user signed in via the
// governance Supabase project?". Used by the workspace token provider
// and any auth diagnostic that needs the federated JWT directly.
export const governanceSessionAccessToken = (rawSupabaseUrl) =>
  _readToken(_supabaseStorageKey(rawSupabaseUrl))

const _createAdapterClient = ({ url, anonKey, rawSupabaseUrl, getRealtimeClient }) => {
  // Hoist storage key + ref derivation out of the per-request fetch closure.
  const storageKey = _supabaseStorageKey(rawSupabaseUrl)

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Unique storageKey so this REST-only adapter doesn't share the
      // session bucket with the raw client. supabase-js v2.103+ warns
      // "Multiple GoTrueClient instances detected" when two clients share
      // a storageKey — even with persistSession: false. We forward the
      // user's token via the global.fetch shim, so this bucket is unused.
      storageKey: '_sym_adapter_rest_only_noop'
    },
    realtime: { params: { eventsPerSecond: 20 } },
    global: {
      // Strip `x-client-info` before sending: supabase-js auto-injects it
      // (sdk version + browser fingerprint) but the wrapper's CORS
      // allow-list doesn't include it, so the OPTIONS preflight fails
      // with "Request header field x-client-info is not allowed by
      // Access-Control-Allow-Headers" and the actual request never goes
      // out. supabase-js v2 always passes init.headers as a POJO, so a
      // shallow clone + delete is sufficient.
      fetch: (input, init = {}) => {
        const headers = { ...(init.headers || {}) }
        const token = _readToken(storageKey)
        if (token) headers.Authorization = `Bearer ${token}`
        delete headers['x-client-info']
        delete headers['X-Client-Info']
        init.headers = headers
        return fetch(input, init)
      }
    }
  })

  // Re-route realtime from wrapper URL → raw Supabase URL.
  // SupabaseClient.channel() delegates to this.realtime.channel(), so
  // replacing client.realtime is sufficient — no call sites need updating.
  if (typeof getRealtimeClient === 'function') {
    try {
      const rawClient = getRealtimeClient()
      if (rawClient?.realtime) client.realtime = rawClient.realtime
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePassthrough] could not bind raw realtime to adapter client:', err)
    }
  }

  return client
}

// Public — produces a smbls fetch-adapter spec the workspace shell
// registers at boot. Pass `apiBase` as a function when you want runtime
// channel flips (`localStorage.symbols_api_channel = 'localNext'`) to
// take effect on subsequent createClient calls; pass a string for the
// common eager case.
export const createSupabasePassthroughConfig = ({
  apiBase,
  rawSupabaseUrl,
  anonKey,
  getRealtimeClient,
  retry = { retry: '3', delay: '1000' }
}) => {
  const _resolveBase = () => (typeof apiBase === 'function' ? apiBase() : apiBase)
  const _passthroughUrl = () => `${workspaceProjectBaseUrl(_resolveBase())}/sb`
  return {
    adapter: 'supabase',
    createClient: (clientUrl, clientKey) =>
      _createAdapterClient({
        url: clientUrl || _passthroughUrl(),
        anonKey: clientKey || anonKey,
        rawSupabaseUrl,
        getRealtimeClient
      }),
    get url () { return _passthroughUrl() },
    key: anonKey,
    retry
  }
}

export const workspaceProjectEdgeFunctionUrl = (apiBase, name) =>
  `${workspaceProjectBaseUrl(apiBase)}/sb/functions/v1/${name}`
