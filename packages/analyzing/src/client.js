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
 *   kind         'workspace' | 'project'  session FAMILY. 'workspace' = the
 *                my.symbols shell used by the team; 'project' = a visitor
 *                of a published site / tenant app (bootAnalyzing's public
 *                mode sets it). Stamped as `envelope.kind` on EVERY
 *                outbound envelope so the server files the session in the
 *                right family regardless of its projectId (a shell surface
 *                booted as 'system--canvas' stays workspace telemetry).
 *                Unset → the server falls back to its legacy rule
 *                (projectId === 'workspace' → workspace, else project).
 *                Every envelope also carries `page.utcOffset` (integer
 *                minutes EAST of UTC, `-new Date().getTimezoneOffset()`)
 *                and a `page.timezone` fill when the page block lacks one.
 *   visitor      false | object  VISITOR IDENTITY (addendum). Default: a
 *                first-party random id per origin in localStorage
 *                (`smbls_vid` — never a cookie, never a fingerprint) with
 *                `firstSeenAt` + the visitor's session counter; stamped as
 *                `page.visitor = { id, firstSeenAt, returning, seq }` on
 *                EVERY envelope (inside `page`, like landing). `false`
 *                disables it (no stamp, per-boot session id as before);
 *                an object `{ id, firstSeenAt, returning?, seq? }` injects
 *                one (tests / SSR). Storage unavailable → no stamp, no
 *                throw. See createVisitorStore.
 *   sessionTimeoutMs  number  session continuity (default 30 min): the
 *                session id lives in sessionStorage (`smbls_sid`) with
 *                its last activity; a boot inside the timeout REUSES the
 *                id (one visit = one session across page loads), a boot
 *                or an event past it mints a new one (seq + 1) — mid-page
 *                through state.startNewSession, which ships the old id's
 *                terminal envelope first (stamped with the OLD visitor
 *                seq). Only captured EVENTS refresh the activity clock — a
 *                flush (pagehide, timer) does not, so an idle tab's own
 *                beacons never keep its session alive. An explicit
 *                `sessionId` wins and disables the continuity logic.
 *   storage      { localStorage, sessionStorage }  injection for tests /
 *                non-browser hosts (defaults to the globals).
 *   landing      object  FIRST-TOUCH override (tests + SSR consumers):
 *                `{ url, referrer, utm: { source, medium, campaign, term,
 *                content } }`. Unset → captured ONCE at createAnalyzing
 *                time from location.href / document.referrer / the utm_*
 *                query params (captureLanding) and stamped as
 *                `page.landing` on EVERY envelope, so the server records
 *                the session's first touch (AnalyzedWriteService
 *                .resolveLanding, $setOnInsert) whichever envelope of the
 *                session lands first. Rides INSIDE `page` because the
 *                mermaid relay rebuilds the envelope from a fixed field
 *                list and passes `page` through whole.
 *
 * Auth (pick one):
 *   apiKey       string                          X-Analyze-Key header
 *   getAuth      fn() => string|Promise<string>  Authorization bearer
 *   sdk          @symbo.ls/sdk instance          auto-pulls bearer from tokenManager
 *
 * Tuning:
 *   capture      object   overrides the 'remote' capture preset. NOTE:
 *                network capture is OFF by default — the server discards
 *                un-opted-in logType='network' envelopes at ingest (server
 *                cd64446f), so shipping them is wasted client CPU + egress.
 *                Opt in with the same levers the server honors: `debug: true`
 *                (restores end-to-end — the envelope stamps `app.debug`, the
 *                server's per-envelope lever) or `capture: { network: true }`
 *                / runtime `setNetworkCapture(true)` (the client half of the
 *                per-workspace Organization.settings.analyzedNetworkCapture
 *                opt-in). See resolveNetworkCapture below.
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
 *   - setNetworkCapture(enabled)
 *   - flush()
 *   - shutdown()
 *   - sessionId
 */

/**
 * Emitter-side network-capture default, mirroring the client-visible
 * subset of the server ingest gate
 * (AnalyzedWriteService.resolveNetworkCaptureEnabled, server cd64446f):
 *   1. debug flag — wins first, like the server's per-envelope lever
 *      (`envelope.app?.debug === true`); the remote sink stamps
 *      `app.debug` on every envelope so this ONE switch restores
 *      logType='network' traces end-to-end.
 *   2. explicit `capture.network` boolean — the client half of the
 *      per-workspace `Organization.settings.analyzedNetworkCapture`
 *      opt-in; the consumer threads the setting, the server validates
 *      it independently against the org record.
 *   3. default OFF — the server's ANALYZED_CAPTURE_NETWORK ops env
 *      switch is not visible from the client; the server stays the
 *      backstop for anything the client can't see.
 * Exported for direct unit testing.
 */
export const resolveNetworkCapture = ({ debug, captureOverrides } = {}) => {
  if (debug === true) return true
  if (captureOverrides && typeof captureOverrides.network === 'boolean') {
    return captureOverrides.network
  }
  return false
}

// ── First-touch landing capture ─────────────────────────────────────────
// `{ url, referrer, utm: { source, medium, campaign, term, content } }` as
// seen at the moment the client is created (the page load — the first
// touch). Each utm field comes from the utm_<name> query param of
// `location.search`, trimmed, capped at LANDING_MAX_LEN, omitted when
// empty; the `utm` key is omitted when no field resolved; `url` /
// `referrer` are omitted when unavailable. Never throws — outside a
// browser (SSR, tests without globals) it returns `{}`. Pure over the
// globals it reads; exported for direct unit testing.
export const LANDING_MAX_LEN = 200
export const UTM_PARAMS = ['source', 'medium', 'campaign', 'term', 'content']

const _capLanding = (v) => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > LANDING_MAX_LEN ? t.slice(0, LANDING_MAX_LEN) : t
}

export const captureLanding = ({ location: loc, document: doc } = {}) => {
  const out = {}
  try {
    const l = loc || (typeof location !== 'undefined' ? location : null)
    const d = doc || (typeof document !== 'undefined' ? document : null)
    const url = _capLanding(l?.href)
    if (url) out.url = url
    const referrer = _capLanding(d?.referrer)
    if (referrer) out.referrer = referrer
    const search = typeof l?.search === 'string' ? l.search : ''
    if (search) {
      const params = new URLSearchParams(search)
      const utm = {}
      for (const name of UTM_PARAMS) {
        const v = _capLanding(params.get(`utm_${name}`))
        if (v) utm[name] = v
      }
      if (Object.keys(utm).length) out.utm = utm
    }
  } catch {}
  return out
}

// ── Visitor identity + session continuity ──────────────────────────────
// Two first-party records, both JSON, both best-effort (every storage
// access is guarded — a private-mode / sandboxed page simply gets no
// visitor stamp and a per-boot session id):
//   localStorage   smbls_vid  { id, firstSeenAt, seq }   the VISITOR (per
//                  origin; `seq` = how many sessions this visitor has had)
//   sessionStorage smbls_sid  { sessionId, lastActivityAt, seq, returning }
//                  the CURRENT session of this tab
// `createVisitorStore` is pure over the storages it is handed; exported
// for direct unit testing with fake storages.
export const VISITOR_KEY = 'smbls_vid'
export const SESSION_KEY = 'smbls_sid'
export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000

const mintId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const _readJson = (storage, key) => {
  try {
    const raw = storage?.getItem?.(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
const _writeJson = (storage, key, value) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
const _global = (name) => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis[name] : undefined
  } catch {
    return undefined
  }
}

export const createVisitorStore = ({
  localStorage: ls = _global('localStorage'),
  sessionStorage: ss = _global('sessionStorage'),
  now = () => Date.now(),
  sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
  visitor: injected = undefined,
  sessionId: explicitSessionId = undefined
} = {}) => {
  const timeout =
    typeof sessionTimeoutMs === 'number' && sessionTimeoutMs > 0
      ? sessionTimeoutMs
      : DEFAULT_SESSION_TIMEOUT_MS
  const enabled = injected !== false

  // ── the visitor record ──
  // `existed` = the record was there before this boot (the visitor had
  // been here before).
  let vid = null
  let existed = false
  if (enabled) {
    if (injected && typeof injected === 'object' && injected.id) {
      vid = {
        id: String(injected.id),
        firstSeenAt: Number(injected.firstSeenAt) || now(),
        seq: Number.isInteger(injected.seq) && injected.seq > 0 ? injected.seq : 0
      }
      existed = injected.returning === true || vid.seq > 0
    } else {
      const stored = _readJson(ls, VISITOR_KEY)
      if (stored && typeof stored.id === 'string' && stored.id) {
        vid = {
          id: stored.id,
          firstSeenAt: Number(stored.firstSeenAt) || now(),
          seq: Number.isInteger(stored.seq) && stored.seq > 0 ? stored.seq : 0
        }
        existed = true
      } else if (ls) {
        vid = { id: mintId(), firstSeenAt: now(), seq: 0 }
        if (!_writeJson(ls, VISITOR_KEY, vid)) vid = null
      }
    }
  }

  // ── the session record ──
  let session = null // { sessionId, lastActivityAt, seq, returning }
  const persistSession = () => {
    if (session && ss) _writeJson(ss, SESSION_KEY, session)
  }
  const persistVisitor = () => {
    if (vid && ls && !(injected && typeof injected === 'object')) _writeJson(ls, VISITOR_KEY, vid)
  }
  // Mint a NEW session for this visitor: seq + 1 on the visitor record;
  // `returning` = the visitor had a session before this one.
  // Two tabs each hold a copy of the visitor record; the counter is
  // re-read from localStorage at mint time so the second tab's rotation
  // continues the shared count instead of repeating a number.
  const syncVisitorSeq = () => {
    if (!vid || (injected && typeof injected === 'object')) return
    const stored = _readJson(ls, VISITOR_KEY)
    if (stored && stored.id === vid.id && Number.isInteger(stored.seq) && stored.seq > vid.seq) {
      vid.seq = stored.seq
    }
  }
  const mint = (t, nextId) => {
    syncVisitorSeq()
    const returning = vid ? vid.seq > 0 || existed : false
    if (vid) vid.seq += 1
    session = {
      sessionId: nextId || mintId(),
      lastActivityAt: t,
      startedAt: t,
      seq: vid ? vid.seq : 1,
      returning
    }
    persistVisitor()
    persistSession()
    return session
  }

  if (explicitSessionId) {
    // Caller-owned id: no continuity, but still a session of this visitor.
    const returning = vid ? existed : false
    syncVisitorSeq()
    session = { sessionId: String(explicitSessionId), lastActivityAt: now(), startedAt: now(), seq: vid ? vid.seq + 1 : 1, returning }
    if (vid) {
      vid.seq += 1
      persistVisitor()
    }
  } else {
    const t = now()
    const stored = _readJson(ss, SESSION_KEY)
    const fresh =
      stored &&
      typeof stored.sessionId === 'string' &&
      stored.sessionId &&
      typeof stored.lastActivityAt === 'number' &&
      t - stored.lastActivityAt >= 0 &&
      t - stored.lastActivityAt < timeout
    if (fresh) {
      session = {
        sessionId: stored.sessionId,
        lastActivityAt: t,
        startedAt: Number(stored.startedAt) || stored.lastActivityAt,
        seq: Number.isInteger(stored.seq) && stored.seq > 0 ? stored.seq : vid ? vid.seq || 1 : 1,
        returning: stored.returning === true
      }
      persistSession()
    } else {
      mint(t)
    }
  }

  return {
    enabled: !!vid,
    get sessionId () {
      return session.sessionId
    },
    // The stamp: null when identity is off / storage unavailable.
    visitor () {
      if (!vid) return null
      return {
        id: vid.id,
        firstSeenAt: vid.firstSeenAt,
        returning: session.returning === true,
        seq: session.seq
      }
    },
    // Activity keeps the session alive (called on every event + flush).
    touch (t = now()) {
      if (!session) return
      session.lastActivityAt = t
      persistSession()
    },
    // Past the timeout since the last activity?
    expired (t = now()) {
      if (!session || explicitSessionId) return false
      return t - session.lastActivityAt >= timeout
    },
    // Start the next session (seq + 1, returning true); returns its id.
    rotate (t = now(), nextId) {
      return mint(t, nextId).sessionId
    },
    // Test seam.
    _debug () {
      return { vid: vid ? { ...vid } : null, session: session ? { ...session } : null, existed }
    }
  }
}

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
    kind,
    landing: landingOverride,
    visitor: visitorOpt,
    sessionTimeoutMs,
    storage: storageOpt,
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
  // mermaid ingest endpoint. workspaceId / projectId / domain are ADVISORY
  // here, not authoritative: mermaid re-resolves them server-side from the
  // request Origin header on every envelope. The page can't lie about which
  // project it belongs to (CORS-enforced), so it doesn't need to know
  // — missing/empty values are fine. See ticket
  // SDK-ANALYZING-PUBLIC-TOLERATE-MISSING-WORKSPACE-ID and
  // architecture/MODEL.md §"Per-org visitor telemetry" → "No client-side scope".
  let resolvedTransport = transport
  // Unload-safe terminal delivery (SDK mode). The async transport below is
  // killed by an unloading page, so the pagehide/beforeunload terminal
  // envelope — the one that stamps session.endedAt — never reached the
  // server from a real close (measured: zero organically-ended sessions
  // across hours of tab churn). The sink's sync flushes route through
  // resolvedSyncTransport (defined after the async transport below) —
  // sendBeacon with a preflight-free text/plain body. The ingest URL is
  // refreshed on every successful async delivery, so it is synchronously
  // available at unload with no awaits to lose.
  let resolvedSyncTransport = null
  const _syncCache = { url: null, token: null }
  const _syncCacheRefresh = (live, token) => {
    const apiBase = live?._context?.apiUrl
    if (apiBase) _syncCache.url = `${apiBase}/core/analyzed/ingest`
    if (token) _syncCache.token = token
  }
  if (!resolvedTransport && mode === 'public') {
    // Same-origin default so mermaid's HTMLRewriter can inject the tracker
    // stub without having to know an absolute ingest URL. Mermaid's /v1/
    // analytics/ingest route is the canonical endpoint per
    // architecture/MODEL.md §"Per-org visitor telemetry".
    const resolvedIngestUrl = ingestUrl || '/v1/analytics/ingest'
    // Dev-mode visibility: warn (don't throw) when scope is missing so the
    // developer can see the gap without breaking prod traffic.
    if (projectEnv === 'development' && typeof console !== 'undefined') {
      if (!workspaceId) {
        try { console.warn('[analyzing] no workspaceId provided; mermaid will resolve from Origin') } catch {}
      }
      if (!ingestUrl) {
        try { console.warn(`[analyzing] no ingestUrl provided; defaulting to ${resolvedIngestUrl}`) } catch {}
      }
    }
    resolvedTransport = async (envelope) => {
      try {
        const res = await fetch(resolvedIngestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...envelope,
            // Advisory scope — mermaid re-resolves authoritative values
            // server-side. Send what we have; let omitted fields be undefined
            // so JSON.stringify drops them rather than POSTing `null`.
            workspace_id: workspaceId || undefined,
            project_id: projectId || undefined,
            project_env: projectEnv || undefined,
            domain: domain || undefined
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
        // The analyzed surface migrated from the workspace-project Supabase
        // worker to the main API server's Mongo-backed /core/analyzed/* routes
        // (SERVER-LOGS-MONGO-MIGRATION Phases 1–4). Hit the main apiUrl, NOT
        // workspaceApiUrl — the worker route was retired.
        const apiBase = ctx.apiUrl
        if (!apiBase) return { ok: false, reason: 'no-api-base' }
        const token = await _resolveIngestToken(live)
        if (!token) return { ok: false, reason: 'no-auth' }
        const url = `${String(apiBase).replace(/\/+$/, '')}/core/analyzed/ingest`
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

    // Circuit-breaker state. The token in localStorage may be issued by a
    // different channel than the API the workspace is currently pinned to
    // (e.g. user signed in via dev.api.symbols.app but workspace.localhost
    // forces channel='local'). Every ingest then 401s. After the FIRST 401
    // we stop hitting the wire — capture() still runs, envelopes pile into a
    // bounded ring buffer, and we drain on the next storage event that
    // mutates `symbols_access_token` (i.e. fresh sign-in). See ticket
    // SDK-ANALYZING-401-CIRCUIT-BREAKER.
    const BUFFER_CAP = 100
    let _ingestSuspended = false
    let _suspendWarned = false
    const _dropWarned = new Set()
    const _buffer = []
    const _bufferPush = (envelope) => {
      _buffer.push(envelope)
      // FIFO drop-oldest — bound memory under sustained suspension.
      if (_buffer.length > BUFFER_CAP) _buffer.shift()
    }
    const _tryDeliver = async (envelope) => {
      const live = _resolveSdk()
      if (!live) return { ok: false, reason: 'no-sdk' }
      const _token = await _resolveIngestToken(live)
      if (!_token) return { ok: false, reason: 'no-auth' }
      _syncCacheRefresh(live, _token)
      if (typeof live.execute === 'function') {
        try {
          const res = await live.execute('analyzed', 'ingest', envelope)
          if (!res?.error) return { ok: true }
          // Detect 401 via either the result.status or the error message
          // shape the dispatcher surfaces — fall through to _directIngest
          // for both so the same 401-check path applies.
        } catch (_) { /* fall through */ }
      }
      return _directIngest(live, envelope)
    }
    const _drainBuffer = async () => {
      if (!_buffer.length) return
      const pending = _buffer.splice(0)
      for (const env of pending) {
        const res = await _tryDeliver(env)
        if (res?.status === 401) {
          // Still 401 — re-suspend, requeue this and remaining envelopes.
          _ingestSuspended = true
          _bufferPush(env)
          return
        }
      }
    }
    // Listen for cross-tab + same-tab token rotation. The `storage` event
    // fires on the `symbols_access_token` key when localStorage.setItem
    // happens in ANOTHER tab; we also flip on the next ingest after a
    // local sign-in because resolvedTransport is called per-event.
    if (isBrowser) {
      try {
        window.addEventListener('storage', (e) => {
          if (e?.key === 'symbols_access_token' && e.newValue && e.newValue !== e.oldValue) {
            _ingestSuspended = false
            _suspendWarned = false
            _drainBuffer().catch(() => {})
          }
        }, { passive: true })
      } catch {}
    }

    resolvedTransport = async (envelope) => {
      if (_ingestSuspended) {
        _bufferPush(envelope)
        return { ok: false, reason: 'suspended' }
      }
      const live = _resolveSdk()
      if (!live) return { ok: false }
      // Auth gate: server rejects unauthenticated /analyzed/ingest with 401.
      // Drop the envelope silently when no token is resolvable instead of
      // generating 401-per-event noise in every signed-out user's DevTools.
      // Telemetry is best-effort by contract — silent drop is preferable to
      // breaking the page-load logs.
      const _token = await _resolveIngestToken(live)
      if (!_token) return { ok: false, reason: 'no-auth' }
      _syncCacheRefresh(live, _token)
      // Prefer the typed dispatcher when services are wired — that path
      // benefits from the SDK's retry/backoff + token refresh hooks.
      if (typeof live.execute === 'function') {
        try {
          const res = await live.execute('analyzed', 'ingest', envelope)
          if (!res?.error) return { ok: true }
          // "Unknown entity" surfaces here too — fall through to direct fetch.
        } catch (_) { /* fall through */ }
      }
      const result = await _directIngest(live, envelope)
      if (result?.status === 401) {
        _ingestSuspended = true
        if (!_suspendWarned && typeof console !== 'undefined') {
          _suspendWarned = true
          try { console.warn('[analyzing] ingest suspended after 401; will resume on next sign-in') } catch {}
        }
        _bufferPush(envelope)
      } else if (result && result.ok === false && typeof console !== 'undefined') {
        // Telemetry stays best-effort (the envelope is dropped, never
        // requeued), but a drop must not be INVISIBLE: one warn per distinct
        // status/reason per session. A silent non-401 swallow is how a
        // same-user workspace switch lost every later beacon to a 409 with
        // no signal anywhere (tickets/analytics.md ANALYZING-SESSION-ROTATE-1).
        const key = String(result.status ?? result.reason ?? 'unknown')
        if (!_dropWarned.has(key)) {
          _dropWarned.add(key)
          try {
            console.warn(`[analyzing] ingest envelope dropped (${key}); further drops with this status are silent`)
          } catch {}
        }
      }
      return result
    }

    // The terminal request MUST be CORS-"simple" (no preflight). A fetch
    // with an Authorization header (or a JSON content-type) is preflighted,
    // and Chrome drops the follow-up POST when the initiating page unloads
    // between OPTIONS and POST — measured live: the preflight got its 200,
    // the terminal POST never hit the wire, endedAt never landed. So:
    // sendBeacon with a text/plain Blob (safelisted → zero preflight,
    // unload-proof by contract), NO auth header — the server's ingest is
    // optionalAuth and scopes the anonymous path by envelope.workspace_id,
    // and isVisitor is insert-only there so an anonymous terminal envelope
    // can only stamp endedAt on the session it belongs to, never reclassify
    // it. fetch-keepalive (still simple: text/plain, no auth) is the
    // fallback where sendBeacon is unavailable.
    resolvedSyncTransport = (envelope) => {
      if (!_syncCache.url) return false
      const body = (() => {
        try { return JSON.stringify(envelope) } catch (_) { return null }
      })()
      if (!body) return false
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = typeof Blob !== 'undefined' ? new Blob([body], { type: 'text/plain' }) : body
          if (navigator.sendBeacon(_syncCache.url, blob)) return true
        }
      } catch (_) { /* fall through to keepalive */ }
      if (typeof fetch !== 'function') return false
      try {
        fetch(_syncCache.url, {
          method: 'POST',
          keepalive: true,
          credentials: 'omit',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain' },
          body
        }).catch(() => {})
        return true
      } catch (_) {
        return false
      }
    }
  }
  if (!endpoint && !resolvedTransport) {
    throw new Error('[@symbo.ls/analyzing] one of { sdk, endpoint, transport, mode: "public" } is required')
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

  // Visitor identity + session continuity (addendum): the store decides
  // the session id (an explicit `sessionId` wins) and owns the visitor
  // stamp. Never throws — a broken storage yields a per-boot id and no
  // visitor stamp, exactly the pre-addendum behaviour.
  let visitorStore = null
  try {
    visitorStore = createVisitorStore({
      ...(storageOpt && typeof storageOpt === 'object' ? storageOpt : {}),
      sessionTimeoutMs,
      visitor: visitorOpt,
      sessionId
    })
  } catch {
    visitorStore = null
  }
  const resolvedSessionId = sessionId || visitorStore?.sessionId || mintId()
  let _visitorStampFreeze = null

  // ── Family + clock stamp ───────────────────────────────────────────────
  // Every outbound envelope (batch AND the terminal beacon — both go through
  // the remote sink's beforeSend) gets `kind` (when configured) and a page
  // block carrying the client's UTC offset in integer minutes east
  // (Tbilisi = 240, New York = -240) plus an IANA `timezone` fill. The
  // server stores the offset fill-only (AnalyzedWriteService
  // .resolveUtcOffset) and decides the family from `kind`
  // (resolveSessionKind). Wraps the caller's own beforeSend: the stamp
  // runs first, the caller's mutator sees the stamped envelope and keeps
  // its drop-by-returning-null contract. Never throws — telemetry is
  // best-effort, and a throw here would be caught by the sink and ship the
  // UNstamped envelope, which is exactly the mislabelling this prevents.
  const resolvedKind = kind === 'workspace' || kind === 'project' ? kind : null
  // First touch — captured ONCE, here, and frozen: an SPA navigation later
  // in the session changes location, never the landing. `opts.landing`
  // (an object) replaces the capture for SSR consumers + tests.
  const resolvedLanding =
    landingOverride && typeof landingOverride === 'object' && !Array.isArray(landingOverride)
      ? landingOverride
      : captureLanding()
  const _stampEnvelope = (envelope) => {
    try {
      if (!envelope || typeof envelope !== 'object') return envelope
      if (resolvedKind) envelope.kind = resolvedKind
      const page = envelope.page && typeof envelope.page === 'object' ? envelope.page : {}
      const utcOffset = -new Date().getTimezoneOffset()
      const stamped = { ...page }
      if (Number.isFinite(utcOffset)) stamped.utcOffset = utcOffset
      if (!stamped.timezone) {
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          if (tz) stamped.timezone = tz
        } catch {}
      }
      stamped.landing = resolvedLanding
      try {
        // During a rotation the OLD session's terminal envelope is built
        // synchronously inside state.startNewSession — it must carry the
        // stamp of the session it closes (seq n), not the next one's.
        const v = _visitorStampFreeze || visitorStore?.visitor()
        if (v) stamped.visitor = v
      } catch {}
      envelope.page = stamped
    } catch {}
    return envelope
  }
  const resolvedBeforeSend = (envelope) => {
    const stamped = _stampEnvelope(envelope)
    if (typeof beforeSend !== 'function') return stamped
    try {
      return beforeSend(stamped)
    } catch {
      return stamped
    }
  }

  const remoteSinkConfig = {
    type: 'remote',
    url: endpoint,
    transport: resolvedTransport,
    syncTransport: resolvedSyncTransport,
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
    beforeSend: resolvedBeforeSend,
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

  // ── Session continuity hooks ───────────────────────────────────────────
  // Every captured event (whatever path emitted it — the manual API, the
  // browser listeners, the router) and every flush refresh the session's
  // last activity; an event or a flush that arrives past the timeout first
  // rotates the session (state.startNewSession ships the OLD id's terminal
  // envelope — endedAt — then every later envelope carries the new id).
  let currentSessionId = resolvedSessionId
  // Rotate: freeze the current visitor stamp, start the new session under
  // a pre-minted id (the remote sink ships the OLD id's terminal envelope
  // right there, stamped seq n), THEN advance the store (seq n + 1,
  // returning true) so every later envelope carries the new stamp.
  // A throwing startNewSession leaves the state on the OLD session, so the
  // store must not advance either: return the current id BEFORE rotate()
  // (the store stays expired and the next event retries the rotation).
  const _rotateSession = () => {
    const next = mintId()
    try {
      _visitorStampFreeze = visitorStore?.visitor() || null
      currentSessionId = state.startNewSession(next)
    } catch {
      return currentSessionId
    } finally {
      _visitorStampFreeze = null
    }
    try {
      visitorStore?.rotate(undefined, next)
    } catch {}
    return currentSessionId
  }
  const _rotateIfExpired = () => {
    try {
      if (!visitorStore || !visitorStore.expired()) return false
      _rotateSession()
      return true
    } catch {
      return false
    }
  }
  const _touch = () => {
    try {
      visitorStore?.touch()
    } catch {}
  }
  if (visitorStore) {
    const _stateEmit = state.emit
    state.emit = (event) => {
      _rotateIfExpired()
      _touch()
      return _stateEmit(event)
    }
    // A flush is not activity: it only rotates a session that already
    // expired (so the batch it ships rides the right id).
    const _stateFlush = state.flush
    state.flush = () => {
      _rotateIfExpired()
      return _stateFlush()
    }
  }

  // ── Emitter-side network gate ──────────────────────────────────────────
  // The server discards un-opted-in logType='network' envelopes at ingest
  // (server cd64446f — they were 77% of all analyzedevents rows), so
  // capturing them client-side wastes CPU + egress in every session. Apply
  // the resolved default through the public setCapture API — not just the
  // capture map above — so it holds regardless of which @symbo.ls/analyze
  // version the bundler resolved (older expandPresets let the `remote`
  // preset clobber explicit capture keys). Reads state.config.debug (not
  // the raw opt) so the plugin's `?analyze=debug` URL override counts as
  // the debug lever too. Runs pre-activate, so with capture off the
  // fetch/XHR listeners are never even attached.
  state.setCapture('network', resolveNetworkCapture({
    debug: state.config.debug === true,
    captureOverrides
  }))

  // Thread the live debug flag to the remote sink so every envelope of a
  // debug session stamps `app.debug: true` — the per-envelope opt-in the
  // server's ingest gate honors (its lever 1). Read at flush time via a
  // getter (the sink resolves lazily, after this line) so the URL
  // override applied inside createAnalyzeState is honored as well.
  remoteSinkConfig.getDebug = () => state.config.debug === true

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

  // Rotate the session (tickets/analytics.md ANALYZING-SESSION-ROTATE-1).
  // The server keys a session row on {_id, workspace}; the SAME id under a
  // NEW workspace is refused (409) for the rest of the session. A caller
  // that switches the tenant scope mid-page (the workspace shell's
  // setAnalyzingWorkspace) must call this: the old session is ended
  // (terminal envelope) and every later envelope carries the new id.
  const startNewSession = () => {
    // A caller-driven rotation is a new session of the same visitor too —
    // same order as the timeout rotation (old stamp on the terminal
    // envelope, then the store advances).
    if (visitorStore) return _rotateSession()
    currentSessionId = state.startNewSession()
    return currentSessionId
  }

  // Runtime mirror of the per-workspace opt-in lever — call with the
  // loaded `Organization.settings.analyzedNetworkCapture` value once org
  // settings arrive (they load async, after boot). Post-activate, this
  // also lazily attaches the fetch/XHR listeners that were skipped while
  // capture was off. The server validates the same setting independently
  // at ingest, so no envelope stamp is needed on this path.
  const setNetworkCapture = (enabled) => state.setCapture('network', !!enabled)

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

  // Public-mode auto-identify from tenant Supabase auth (the canonical
  // `@symbo.ls/db` adapter every hosted project uses). Detects sign-in by
  // reading any `sb-*-auth-token` localStorage entry, parses the user
  // object out of the Supabase session blob, and calls identify({ userId,
  // traits: { email } }) so the by-user /logs view attributes visitor
  // events to a real user instead of bucketing them as Anonymous.
  //
  // Targeted to the Symbols-first-party auth path (db.adapter = 'supabase'
  // with the standard storageKey shape) — does NOT crawl every tenant's
  // ad-hoc auth scheme. Safe by construction: if the project doesn't use
  // Supabase auth, no detection happens and existing identify() calls from
  // the tenant project (or workspace dogfood via identifyFromSdk) still
  // take precedence — _lastIdentitySig dedup makes re-identify a no-op.
  //
  // Watches `storage` events so signing in / out mid-session retroactively
  // attributes the rest of the session correctly. Sign-out (token cleared)
  // calls identify(null) to reset.
  if (mode === 'public' && typeof window !== 'undefined') {
    const _detectSupabaseIdentity = () => {
      try {
        if (typeof localStorage === 'undefined') return null
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !/^sb-.*-auth-token$/.test(key)) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          // Supabase session shape: { access_token, refresh_token, user: { id, email, ... } }
          // Older clients sometimes serialize as a 4-tuple array — accept both.
          const user = parsed?.user || (Array.isArray(parsed) && parsed[5])
          if (user?.id) return { userId: user.id, email: user.email || null }
        }
      } catch {
        /* tenant auth shape we don't recognize — skip silently */
      }
      return null
    }

    const _applyDetected = () => {
      const detected = _detectSupabaseIdentity()
      if (detected) {
        identify({
          userId: detected.userId,
          traits: detected.email ? { email: detected.email } : {}
        })
      } else if (contextStore.user) {
        // Token cleared mid-session → sign-out. Reset identity so the rest
        // of the session attributes to Anonymous correctly.
        identify(null)
      }
    }

    try { _applyDetected() } catch { /* never block boot on auth detect */ }

    const _onStorage = (e) => {
      if (!e?.key || !/^sb-.*-auth-token$/.test(e.key)) return
      try { _applyDetected() } catch {}
    }
    window.addEventListener('storage', _onStorage, { passive: true })
    state.__teardown.push(() => window.removeEventListener('storage', _onStorage))
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
    setNetworkCapture,
    flush,
    shutdown,
    startNewSession,
    // Live: reflects the id in force AFTER a startNewSession() (the boot id
    // until then).
    get sessionId () { return currentSessionId }
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
