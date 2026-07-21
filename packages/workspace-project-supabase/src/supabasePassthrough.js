// Supabase fetch-adapter for the workspace-project wrapper. Frontend
// MUST NOT know whether a tenant table is backed by Supabase or Mongo;
// every call goes through `sdk.execute(entity, op, args)` and dispatch
// resolves here when the entity is Supabase-backed. URL composition
// (`/workspace-project/sb`) and the REST-vs-realtime split (raw WS
// endpoint, wrapper-proxied REST) are SDK-internal.

import { workspaceProjectBaseUrl } from './WorkspaceProjectService.js'

// `@supabase/supabase-js` is an OPTIONAL peer dep
// (peerDependenciesMeta.optional). A static `import { createClient } from
// '@supabase/supabase-js'` resolves at module-load time and crashes with
// ERR_MODULE_NOT_FOUND for any consumer that doesn't install supabase —
// even if they never touch the passthrough. Lazy-resolve via dynamic
// import the first time someone actually constructs an adapter client.
let _createClientCache = null
let _createClientPromise = null
const _resolveCreateClient = () => {
  if (_createClientCache) return Promise.resolve(_createClientCache)
  if (!_createClientPromise) {
    const pkg = '@supabase/' + 'supabase-js' // split so bundlers don't statically resolve
    _createClientPromise = import(/* webpackIgnore: true */ pkg).then(
      (mod) => {
        _createClientCache = mod.createClient
        return _createClientCache
      },
      (err) => {
        _createClientPromise = null
        throw new Error(
          '@supabase/supabase-js is required to use the Supabase passthrough adapter ' +
          'but is not installed. Add it to your dependencies: ' +
          '`npm install @supabase/supabase-js`. ' +
          'Underlying loader error: ' + (err && err.message)
        )
      }
    )
  }
  return _createClientPromise
}

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

// Public — legacy reader for the workspace-extension (governance) Supabase
// session token. That project is removed, so this is now effectively a
// no-op (always resolves null); callers fall back to the Mongo token.
export const workspaceExtensionSessionAccessToken = (rawSupabaseUrl) =>
  _readToken(_supabaseStorageKey(rawSupabaseUrl))

const _createAdapterClient = async ({ url, anonKey, rawSupabaseUrl, getRealtimeClient }) => {
  // Hoist storage key + ref derivation out of the per-request fetch closure.
  const storageKey = _supabaseStorageKey(rawSupabaseUrl)
  const createClient = await _resolveCreateClient()

  // Resolve the browser's native WebSocket constructor and hand it to
  // supabase-js's realtime client. supabase-realtime-js v2.105+ ships
  // an environment-detector that mis-fires in some bundled contexts —
  // when `process.versions.node` is polyfilled by the bundler but the
  // global `WebSocket` reference isn't visible from the realtime
  // module's scope, detectEnvironment falls through to the Node.js
  // branch and throws "Node.js 20 detected without native WebSocket
  // support", crashing the whole client init even for REST-only
  // callers. Passing `transport` explicitly bypasses detection.
  //
  // The `?? globalThis.WebSocket` fallback is intentionally written as
  // a runtime expression (not a `const _nativeWS = …` capture) — Parcel
  // has been observed to statically-fold module-top-level captures of
  // `typeof WebSocket` to `null` at build time (build runs in Node
  // where `WebSocket` is undefined), permanently removing the spread
  // from the deployed bundle. Reading `globalThis.WebSocket` inline at
  // call time always observes the live browser environment.
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
    realtime: {
      params: { eventsPerSecond: 20 },
      transport: (typeof globalThis !== 'undefined' && globalThis.WebSocket) ||
        (typeof window !== 'undefined' && window.WebSocket) ||
        undefined
    },
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
      // supabase-js v2.40+ defines `realtime` via Object.defineProperty
      // without a setter on some builds, so a plain assignment silently
      // no-ops in strict mode. Force the override via defineProperty.
      if (rawClient?.realtime) {
        Object.defineProperty(client, 'realtime', {
          value: rawClient.realtime,
          writable: true,
          configurable: true,
          enumerable: true
        })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePassthrough] could not bind raw realtime to adapter client:', err)
    }
  }

  return client
}

// Public — produces a smbls fetch-adapter spec the workspace shell
// registers at boot. Pass `apiBase` as a function when you want runtime
// channel flips (`localStorage.symbols_api_channel = 'next'`) to
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
