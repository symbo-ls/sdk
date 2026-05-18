'use strict'

import {
  createAnalyzeState,
  makeEvent,
  analyzePlugin
} from '@symbo.ls/analyze'
// `classifyEvent` is duplicated locally as `classifyEnvelope` in ./classify.js
// so this package stays parseable when @symbo.ls/analyze's root index.js is
// loaded by a bundler that can't statically resolve `export *` re-exports
// (Parcel's tree-shaker hits this in the workspace shell). The two
// implementations are kept in sync — see classify.js header.
import { classifyEnvelope as classifyEvent } from './classify.js'
import { SDK_NAME, SDK_VERSION } from './meta.js'

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * createAnalyzing — build an observability client that pipes the
 * @symbo.ls/analyze plugin's stream to a server endpoint.
 *
 * Required:
 *   endpoint     string  e.g. https://analyzed.symbo.ls/v1/ingest
 *   appKey       string  app identifier (project key)
 *
 * Recommended:
 *   tenantKey    string  multi-tenant partition key
 *   release      string  build version / git sha
 *   env          string  'production' | 'next' | 'staging' | 'dev'
 *
 * Auth (pick one):
 *   apiKey       string                          X-Analyze-Key header
 *   getAuth      fn() => string|Promise<string>  Authorization bearer
 *   sdk          @symbo.ls/sdk instance          auto-pulls bearer from tokenManager
 *
 * Tuning:
 *   capture      object   overrides the 'remote' capture preset
 *   level        string   'error'|'warn'|'info'|'debug'|'trace' (default 'info')
 *   sampleRate   number   0..1 client-side downsample (default 1)
 *   redact       array    regex/glob patterns for PII scrubbing
 *   beforeSend   fn       last-mile envelope mutator (return null to drop)
 *   transport    fn       override the default fetch transport
 *
 * Returns an object with:
 *   - plugin               smbls Plugin to register on create()
 *   - analyzeConfig        the create({ analyze }) block (alias: config)
 *   - state                raw analyze state for advanced use
 *   - capture(level, msg, data)
 *   - captureError(err, data?)
 *   - captureMessage(msg, level?, data?)
 *   - addMeasurement(name, value, unit?)
 *   - identify({ userId, traits? })
 *   - setContext(key, value)
 *   - setTag(key, value)
 *   - flush()
 *   - shutdown()
 *   - sessionId
 */
export const createAnalyzing = (opts = {}) => {
  const {
    endpoint,
    appKey,
    tenantKey,
    release,
    env,
    apiKey,
    sdk,
    getAuth,
    transport,
    capture: captureOverrides,
    level = 'info',
    sampleRate = 1,
    redact,
    beforeSend,
    debug = false,
    sessionId,
    consoleSink = false,
    memorySink = true,
    batchMs,
    maxBatch,
    maxRetries,
    backoffMs,
    queueLimit,
    // Public mode (mermaid-injected visitor analytics): there's no SDK token —
    // visitors are anonymous, workspace_id is pre-resolved server-side. The
    // ingest URL is mermaid's analytics proxy; mermaid validates by Origin.
    mode = 'authenticated',
    workspaceId,
    projectId,
    projectEnv,
    domain,
    ingestUrl
  } = opts

  if (!appKey) {
    throw new Error('[@symbo.ls/analyzing] appKey is required')
  }

  // Public mode short-circuits the SDK-derived transport entirely. No token
  // resolution, no SDK execute() dispatch — just POST envelopes to the
  // provided ingestUrl with the four scope fields stamped on each one.
  let resolvedTransport = transport
  if (!resolvedTransport && mode === 'public') {
    if (!ingestUrl) {
      throw new Error('[@symbo.ls/analyzing] public mode requires ingestUrl')
    }
    if (!workspaceId) {
      throw new Error('[@symbo.ls/analyzing] public mode requires workspaceId')
    }
    resolvedTransport = async (envelope) => {
      try {
        const res = await fetch(ingestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...envelope,
            workspace_id: workspaceId,
            project_id: projectId,
            project_env: projectEnv,
            domain
          }),
          keepalive: true
        })
        return { ok: res.ok, status: res.status }
      } catch (e) {
        return { ok: false, reason: e?.message || 'fetch-failed' }
      }
    }
  }

  // Default transport — routes the envelope through the workspace-project
  // worker via sdk.execute. The wrapper server-stamps workspace_id from the
  // caller's JWT and writes to analyzed_sessions / analyzed_events. Pass an
  // explicit `transport` to override; pass `endpoint` to keep the legacy
  // direct-fetch path (used by the standalone @symbo.ls/analyzing demo, not
  // by the workspace shell).
  //
  // sdk can be: an SDK instance, a function returning the SDK (lazy), or
  // null. Resolution happens at EACH call so a not-yet-hydrated SDK passed
  // at boot time still produces a working transport once the SDK lands.
  if (!resolvedTransport && sdk) {
    const _resolveSdk = () =>
      typeof sdk === 'function' ? sdk() : sdk

    // Fallback POST when sdk.execute can't dispatch the entity. The
    // workspace-shell SDK may finish booting BEFORE service proxies are
    // hydrated (canvas/studio routes hit this — _services stays empty,
    // sdk.execute throws "Unknown entity"). Without this fallback every
    // event drops on the floor; the dashboard never sees the session.
    //
    // Reads apiUrl + auth from the SDK context that IS initialized
    // (ctx.apiUrl + ctx.workspaceProjectTokenProvider fallback to the
    // legacy Mongo getAuthToken). Same wire shape the workspace-project
    // worker's /analyzed/ingest route accepts, so the server-side write
    // path is unchanged.
    // Resolve the workspace-project bearer token from the SDK context. Used
    // by BOTH the typed-dispatcher gate below AND the _directIngest fallback,
    // so neither path posts to /analyzed/ingest without an Authorization
    // header (the server rejects unauthenticated callers with 401, and
    // every anonymous visitor / signed-out user would otherwise see a
    // stream of "POST .../analyzed/ingest 401" errors in DevTools).
    const _resolveIngestToken = async (live) => {
      const ctx = live?._context || {}
      if (typeof ctx.workspaceProjectTokenProvider === 'function') {
        try {
          const t = await ctx.workspaceProjectTokenProvider()
          const token = typeof t === 'string' ? t : (t?.token || t?.access_token || null)
          if (token) return token
        } catch (_) { /* fall through */ }
      }
      if (typeof live.getAuthToken === 'function') {
        try { return live.getAuthToken() || null } catch (_) {}
      }
      return null
    }

    const _directIngest = async (live, envelope) => {
      try {
        const ctx = live?._context || {}
        const apiBase = ctx.workspaceApiUrl || ctx.apiUrl
        if (!apiBase) return { ok: false, reason: 'no-api-base' }
        const token = await _resolveIngestToken(live)
        if (!token) return { ok: false, reason: 'no-auth' }
        const url = `${String(apiBase).replace(/\/+$/, '')}/workspace-project/analyzed/ingest`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(envelope),
          keepalive: true,
        })
        return { ok: res.ok, status: res.status }
      } catch (e) {
        return { ok: false, reason: e?.message || 'fetch-failed' }
      }
    }

    resolvedTransport = async (envelope) => {
      const live = _resolveSdk()
      if (!live) return { ok: false }
      // Auth gate: server rejects unauthenticated /analyzed/ingest with 401.
      // Drop the envelope silently when no token is resolvable instead of
      // generating 401-per-event noise in every signed-out user's DevTools.
      // Telemetry is best-effort by contract — silent drop is preferable to
      // breaking the page-load logs.
      const _token = await _resolveIngestToken(live)
      if (!_token) return { ok: false, reason: 'no-auth' }
      // Prefer the typed dispatcher when services are wired — that path
      // benefits from the SDK's retry/backoff + token refresh hooks.
      if (typeof live.execute === 'function') {
        try {
          const res = await live.execute('workspaceProject.analyzed', 'ingest', envelope)
          if (!res?.error) return { ok: true }
          // "Unknown entity" surfaces here too — fall through to direct fetch.
        } catch (_) { /* fall through */ }
      }
      return _directIngest(live, envelope)
    }
  }
  if (!endpoint && !resolvedTransport) {
    throw new Error('[@symbo.ls/analyzing] one of { sdk, endpoint, transport, mode: "public" + ingestUrl } is required')
  }

  // Legacy bearer resolver — only used when shipping straight to `endpoint`
  // (no sdk). When `sdk` is present, the workspace-project worker handles auth
  // through its existing token contract and we don't need to hand a bearer to
  // the sink layer.
  const resolveAuth = typeof getAuth === 'function'
    ? getAuth
    : (sdk && !resolvedTransport ? () => safeGetSdkToken(sdk) : null)

  // The mutable bag of identity + tags lives here; getContext() copies it onto
  // every outbound envelope, so updates from identify()/setContext() apply to
  // subsequent batches without rebuilding the state.
  const contextStore = {
    user: null,
    traits: {},
    tags: {}
  }

  const resolvedSessionId = sessionId || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

  const remoteSinkConfig = {
    type: 'remote',
    url: endpoint,
    transport: resolvedTransport,
    apiKey,
    appKey,
    tenantKey,
    release,
    env,
    sessionId: resolvedSessionId,
    sdk: { name: SDK_NAME, version: SDK_VERSION },
    getAuth: resolveAuth,
    getContext: () => ({
      user: contextStore.user,
      traits: { ...contextStore.traits },
      tags: { ...contextStore.tags }
    }),
    classify: classifyEvent,
    beforeSend,
    sampleRate,
    batchMs,
    maxBatch,
    maxRetries,
    backoffMs,
    queueLimit
  }

  const sinks = [remoteSinkConfig]
  if (memorySink) sinks.push('memory')
  if (consoleSink) sinks.push('console')

  const analyzeConfig = {
    enabled: true,
    debug,
    level,
    appId: appKey,
    capture: { remote: true, ...(captureOverrides || {}) },
    sinks,
    redact,
    transformers: ['enrich', 'summarize']
  }

  // Construct the state up front so manual capture works even before the
  // DOMQL `create()` call has activated it (errors during bootstrap, etc.).
  // The plugin lifecycle will pick this same state up via context.analyze
  // when smbls calls prepareContext — see analyzePlugin / context wiring.
  const state = createAnalyzeState(analyzeConfig)

  // ── Manual API ─────────────────────────────────────────────────────────────

  const emit = (event) => state.emit(event)

  const capture = (lvl = 'info', message, data) => {
    emit(makeEvent('manual', lvl, {
      hook: 'sdk.capture',
      message: message != null ? String(message) : null,
      ...(data && typeof data === 'object' ? { data } : {})
    }))
  }

  const captureMessage = (message, lvl = 'info', data) => {
    capture(lvl, message, data)
  }

  const captureError = (err, data) => {
    const error = err instanceof Error ? err : new Error(String(err))
    emit(makeEvent('error', 'error', {
      hook: 'sdk.captureError',
      message: error.message,
      error,
      ...(data && typeof data === 'object' ? { data } : {})
    }))
  }

  const addMeasurement = (name, value, unit = 'ms') => {
    emit(makeEvent('performance', 'info', {
      hook: 'sdk.measurement',
      name,
      value: typeof value === 'number' ? value : Number(value),
      unit
    }))
  }

  // Dedup signature for the last identify() call. Workspace boot has 3+
  // consumers (bootShell, analyzing.js init, app.js identifyFromSdk) each
  // calling identify() on mount with the same { userId, traits } — without
  // dedup that's 3 redundant envelopes per nav. Signature compares userId +
  // stable-stringified traits; matching call no-ops. Sign-out (input == null)
  // resets the signature so the next sign-in always fires.
  let _lastIdentitySig = null
  const _stableTraitsSig = (traits) => {
    if (!traits || typeof traits !== 'object') return ''
    const keys = Object.keys(traits).sort()
    return keys.map((k) => `${k}=${String(traits[k])}`).join('|')
  }

  const identify = (input) => {
    if (input == null) {
      contextStore.user = null
      contextStore.traits = {}
      _lastIdentitySig = null
      return
    }
    const userId = typeof input === 'string' ? input : input.userId || input.id || null
    const traits = typeof input === 'object' ? (input.traits || {}) : {}
    const sig = `${userId || ''}|${_stableTraitsSig(traits)}`
    if (sig === _lastIdentitySig) return
    _lastIdentitySig = sig
    contextStore.user = userId ? { id: userId } : null
    contextStore.traits = { ...traits }
    emit(makeEvent('identify', 'info', {
      hook: 'sdk.identify',
      userId,
      traits
    }))
  }

  const setContext = (key, value) => {
    if (!key) return
    if (value === undefined) {
      delete contextStore.traits[key]
    } else {
      contextStore.traits[key] = value
    }
  }

  const setTag = (key, value) => {
    if (!key) return
    if (value === undefined) {
      delete contextStore.tags[key]
    } else {
      contextStore.tags[key] = String(value)
    }
  }

  const flush = () => state.flush()
  const shutdown = () => state.destroy()

  // Wire global error/promise hooks immediately so failures during DOMQL boot
  // (before plugin.init runs) still ship. attachBrowserListeners is normally
  // called by state.activate() — we let that happen, but error+unhandled are
  // critical enough we mirror them now via a minimal pre-activate listener.
  if (isBrowser && state.config.capture.errors) {
    const earlyError = (e) => {
      emit(makeEvent('error', 'error', {
        hook: 'preboot.error',
        message: e?.message || null,
        error: e?.error || null,
        source: e?.filename || null,
        line: e?.lineno || null,
        col: e?.colno || null
      }))
    }
    const earlyRejection = (e) => {
      const reason = e?.reason
      const err = reason instanceof Error ? reason : null
      emit(makeEvent('error', 'error', {
        hook: 'preboot.unhandledrejection',
        message: err?.message || (typeof reason === 'string' ? reason : 'Unhandled rejection'),
        error: err
      }))
    }
    window.addEventListener('error', earlyError, { passive: true })
    window.addEventListener('unhandledrejection', earlyRejection, { passive: true })
    state.__teardown.push(() => {
      window.removeEventListener('error', earlyError)
      window.removeEventListener('unhandledrejection', earlyRejection)
    })
  }

  return {
    plugin: analyzePlugin,
    // Expose the *expanded* config (preset → flat capture map). The raw input
    // is still under analyzeConfig for debugging, but consumers passing this
    // straight into create({ analyze }) should use the expanded form so they
    // see the same values the runtime does.
    analyzeConfig: state.config,
    config: state.config,
    state,
    capture,
    captureMessage,
    captureError,
    addMeasurement,
    identify,
    setContext,
    setTag,
    flush,
    shutdown,
    sessionId: resolvedSessionId
  }
}

const safeGetSdkToken = async (sdk) => {
  if (!sdk) return null
  try {
    if (typeof sdk.getAccessToken === 'function') return await sdk.getAccessToken()
    if (sdk.tokenManager && typeof sdk.tokenManager.getAccessToken === 'function') {
      return await sdk.tokenManager.getAccessToken()
    }
    if (typeof sdk.token === 'function') return await sdk.token()
    if (typeof sdk.token === 'string') return sdk.token
    return null
  } catch (_) {
    return null
  }
}
