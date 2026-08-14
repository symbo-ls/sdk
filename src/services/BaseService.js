import environment from '../config/environment.js'
import { getTokenManager } from '../utils/TokenManager.js'
import { logger } from '../utils/logger.js'

// Network-vs-HTTP distinction for fetch failures. A `TypeError: Failed
// to fetch` (DNS / TLS / firewall / adblocker / offline) loses host
// context by the time it surfaces to the UI. Detecting it lets us
// surface a diagnostic-friendly message + `code: 'NETWORK_UNREACHABLE'`
// for programmatic branching (retry-once, network-down panel, …) while
// keeping HTTP errors on their existing path.
export const NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE'
const _NETWORK_RX = /failed to fetch|networkerror|load failed/i
const _isNetworkFailure = (err) =>
  err instanceof TypeError && _NETWORK_RX.test(err?.message || '')

// Transient-transport retry policy.
//
// An API restart (nodemon in dev, a rolling deploy in prod) makes every
// in-flight request fail with a bare "Failed to fetch" for a few seconds. That
// is not a real failure — it is a gap — and every call site was paying for it
// individually (the org switcher grew its own `_withRetry`, and the AI chat
// simply showed the raw network string to the user).
//
// Retry ONLY a pre-send transport failure: `code === NETWORK_UNREACHABLE` AND no
// HTTP `status`. A request that reached the server and came back 4xx/5xx is
// never retried here.
//
// Mutations are OPT-IN, never opt-out. A method-blind retry on POST would risk
// duplicate Stripe checkouts, double credit top-ups, duplicate invoices (which
// assign immutable INV- numbers) and duplicate AI conversations. So: idempotent
// verbs retry by default, and non-idempotent ones retry only when their logical
// method name is on this allowlist — each verified to be a safe, abort-before-
// mutate upsert.
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRY_SAFE_METHOD_NAMES = new Set([
  'setActiveOrganization',
  'setActiveWorkspace',
  'getMe',
  // Ending a persona session is idempotent BY CONTRACT (tickets/sonnet.md
  // PERSONA-4: double-end and end-after-expiry must succeed), so a re-sent
  // POST /persona/end can never double-apply — and the exit affordance is a
  // security control that should ride out an API restart rather than fail.
  'endPersona'
])
const RETRY_BASE_DELAY_MS = 300

const _shouldRetryRequest = (err, method, methodName, attempt, maxRetries) => {
  if (attempt >= maxRetries) return false
  // Pre-send transport failures only — never an HTTP status.
  if (err?.code !== NETWORK_UNREACHABLE || err?.status !== undefined) return false
  return IDEMPOTENT_METHODS.has(method) || RETRY_SAFE_METHOD_NAMES.has(methodName)
}

// Exponential backoff with jitter, so a fleet of tabs doesn't retry in lockstep
// and stampede the API the instant it comes back up.
const _retryDelay = (attempt) =>
  RETRY_BASE_DELAY_MS * Math.pow(3, attempt) * (0.75 + Math.random() * 0.5)

// 4 attempts → delays ≈0.3s/0.9s/2.7s (+jitter) ≈ 4s of patience — enough to
// ride out a nodemon restart or a rolling-deploy gap without stalling real
// failures for long. Override per-call via options.maxRetries.
const DEFAULT_MAX_RETRIES = 3

const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const _wrapRequestError = (error, url) => {
  const network = _isNetworkFailure(error)
  const msg = network
    ? `Network unreachable for ${url} — check connection / VPN / DNS / adblocker. (${error.message})`
    : `Request failed: ${error.message}`
  const wrapped = new Error(msg, { cause: error })
  if (error?.status) wrapped.status = error.status
  if (network) wrapped.code = NETWORK_UNREACHABLE
  return wrapped
}

// ── In-flight GET dedupe (workspace boot F6) ────────────────────────────────
//
// App boot fans out MANY byte-identical reads at the same instant — measured
// on one workspace landing: 13× the same workspace-records read, 6×
// notifications, 6× agent-presence, 3× tickets list — and every duplicate
// occupies one of the browser's 6 HTTP/1.1 connections per origin, queueing
// real work behind it (1.7–3.3s per call against remote dev Mongo).
//
// Concurrent IDENTICAL GETs — same URL AND same headers, which includes the
// Authorization header, so two auth scopes never share — now share ONE network
// round-trip: the first caller runs the fetch (with its usual retry policy),
// followers await the same in-flight promise, and the entry is dropped the
// moment it settles. This is NOT a response cache: once settled, the next
// identical call is a fresh request. Failures propagate to every sharer —
// they'd each have received the same failure from their own copy.
//
// GET-only, always. Mutations are NEVER deduped (two deliberate POSTs must
// stay two POSTs). Requests carrying a body or an AbortSignal opt out
// automatically (a sharer's abort must not cancel everyone else's request),
// and a caller can force a private round-trip with `dedupe: false`.
//
// Followers receive a structuredClone of the settled payload so no two
// callers share (and can cross-mutate) one object graph; the leader keeps the
// original. The map key embeds the auth header — it lives ONLY in this
// in-memory map and must never be logged.
const _inflightGets = new Map()

const _canDedupeRequest = (method, options) =>
  method === 'GET' &&
  options.dedupe !== false &&
  options.signal === undefined &&
  options.body === undefined

const _dedupeGetKey = (url, headers) => {
  const h = headers || {}
  let key = url
  for (const name of Object.keys(h).sort()) {
    key += `\n${name.toLowerCase()}:${h[name]}`
  }
  return key
}

const _cloneSettledPayload = (value) => {
  if (!value || typeof value !== 'object') return value
  try {
    // Payloads are JSON.parse output, so both paths clone faithfully.
    if (typeof structuredClone === 'function') return structuredClone(value)
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return value
  }
}

const _dedupeInflightGet = (key, run) => {
  const existing = _inflightGets.get(key)
  if (existing) return existing.then(_cloneSettledPayload)
  const flight = run()
  _inflightGets.set(key, flight)
  const drop = () => {
    if (_inflightGets.get(key) === flight) _inflightGets.delete(key)
  }
  flight.then(drop, drop)
  return flight
}

// Test-only seam: inspect/clear the in-flight table between cases so one
// test's pending flight can never leak into the next. Never used in
// production code.
export const __inflightGetsForTests = {
  size: () => _inflightGets.size,
  clear: () => _inflightGets.clear()
}

export class BaseService {
  constructor ({ context, options } = {}) {
    this._context = context || {}
    this._options = options || {}
    this._ready = false
    this._error = null
    this._apiUrl = null
    this._tokenManager = null
  }

  // Initialize service
  init ({ context }) {
    try {
      const { apiUrl } = context || this._context

      // Get base URL from environment config
      this._apiUrl = apiUrl || environment.apiUrl

      if (!this._apiUrl) {
        throw new Error('Service base URL not configured')
      }

      // Initialize token manager (singleton). TokenManager handles persistence
      this._tokenManager = getTokenManager({
        apiUrl: this._apiUrl,
        onTokenError: error => {
          logger.error('Token management error:', error)
        }
      })

      // Seed token manager with authToken from context (e.g. CLI passes it)
      const ctx = context || this._context
      if (ctx.authToken && !this._tokenManager.getAccessToken()) {
        this._tokenManager.setTokens({ access_token: ctx.authToken })
      }

      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  // Update context
  updateContext (context) {
    // Mutate in place to preserve the shared reference with the SDK context
    if (context && typeof context === 'object') {
      Object.assign(this._context, context)
    }
  }

  // Get service status
  getStatus () {
    return {
      ready: this._ready,
      error: this._error,
      context: { ...this._context }
    }
  }

  // Check if service is ready
  isReady () {
    return this._ready
  }

  // ==================== TENANT-SCOPE DEFAULTING ====================
  //
  // Shared `explicit ?? _context.active* ?? …` resolvers. Hoisted from four
  // hand-rolled per-service versions (AiChatService._aiChatScope,
  // TicketService._workspaceScope, AiService's inline
  // `this._context?.activeWorkspaceId || this._readActiveWorkspace()` (6
  // call-sites), WorkspaceProjectService._chatWorkspaceId) that had drifted
  // subtly differently — see tickets/sdk.md "hoist a BaseService
  // tenant-scope defaulter". Each service keeps its own thin,
  // purpose-named wrapper around these for call-site readability and
  // back-compat with existing tests; the defaulting logic itself lives
  // here once.

  // Resolve a single `workspaceId`: explicit arg wins, then the live SDK
  // context (`_context.activeWorkspaceId`, kept fresh by
  // sdk.switchOrg/switchWorkspace), then — only when opted in — a
  // persisted storage fallback for callers that may run before context is
  // seeded. Returns `undefined` (or storage's own `null`) when nothing
  // resolves, so callers can omit the param entirely for a byte-identical
  // request.
  _resolveWorkspaceId (explicit, { fallbackToStorage = false } = {}) {
    if (explicit !== undefined && explicit !== null && explicit !== '') return explicit
    if (this._context?.activeWorkspaceId) return this._context.activeWorkspaceId
    return fallbackToStorage ? this._readActiveWorkspaceStorage() : undefined
  }

  // Resolve the { orgId, workspaceId } tenant-scope PAIR a call should
  // carry: each key defaults independently — explicit per-key value wins,
  // otherwise falls back to `_context.activeOrgId` / `_context.activeWorkspaceId`.
  // No storage fallback (context is expected to be live by the time these
  // calls fire); a key resolves to `undefined` when neither source has a
  // value, so callers can omit it entirely.
  _resolveScope (explicit = {}) {
    return {
      orgId: explicit?.orgId ?? this._context?.activeOrgId ?? undefined,
      workspaceId: explicit?.workspaceId ?? this._context?.activeWorkspaceId ?? undefined
    }
  }

  // Last-resort workspace pointer for callers that opt into
  // `fallbackToStorage`. MWT-aware by precedence: with multi-workspace tabs
  // ON, the tab's own pointer lives in `sessionStorage`; `localStorage`
  // holds only the shared "last default" a fresh tab seeds from. Reading
  // localStorage first would answer about whichever workspace the BROWSER
  // last defaulted to rather than the tab in question. With MWT OFF,
  // sessionStorage is never written, so this falls through to the
  // equivalent localStorage read.
  _readActiveWorkspaceStorage () {
    try {
      const perTab = globalThis.sessionStorage?.getItem('activeWorkspace')
      if (perTab) return perTab
    } catch (_) { /* sessionStorage unavailable — fall through */ }
    try { return globalThis.localStorage?.getItem('activeWorkspace') || null } catch (_) { return null }
  }

  // Protected helper methods
  _setReady (ready = true) {
    this._ready = ready
    this._error = null
  }

  _setError (error) {
    this._ready = false
    this._error = error
  }

  _getTrackingService () {
    const services = this._context?.services
    const tracking = services?.tracking
    if (!tracking || typeof tracking.trackError !== 'function') {return null}
    return tracking
  }

  _shouldTrackErrors () {
    const name = this?.constructor?.name
    return name !== 'TrackingService'
  }

  _trackServiceError (error, details = {}) {
    if (!this._shouldTrackErrors()) {return}
    try {
      const tracking = this._getTrackingService()
      if (!tracking) {return}
      const context = {
        service: this?.constructor?.name || 'UnknownService',
        apiUrl: this._apiUrl || null,
        ...details
      }
      tracking.trackError(error instanceof Error ? error : new Error(String(error)), context)
    } catch {
      // Do not let tracking failures affect service flow
    }
  }

  _requireAuth () {
    if (!this.getAuthToken()) {
      throw new Error('Authentication required')
    }
  }

  _requireReady (methodName = 'unknown') {
    if (!this.isReady()) {
      throw new Error(`Service not initialized for method: ${methodName}`)
    }
  }

  // Shared HTTP request method
  async _request (endpoint, options = {}) {
    const url = `${this._apiUrl}/core${endpoint}`

    const defaultHeaders = {}

    // Only set Content-Type for JSON requests, not for FormData
    if (!(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json'
    }

    // Use TokenManager for automatic token management
    if (this._requiresInit(options.methodName) && this._tokenManager) {
      try {
        // Ensure we have a valid token (will refresh if needed)
        const validToken = await this._tokenManager.ensureValidToken()

        if (validToken) {
          const authHeader = this._tokenManager.getAuthHeader()
          if (authHeader) {
            defaultHeaders.Authorization = authHeader
          }
        }
      } catch (error) {
        logger.warn(
          'Token management failed, proceeding without authentication:',
          error
        )
      }
    }

    const method = String(options.method || 'GET').toUpperCase()
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    const runFetch = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              ...defaultHeaders,
              ...options.headers
            }
          })

          if (!response.ok) {
            let error = {
              message: `HTTP ${response.status}: ${response.statusText}`
            }
            try {
              error = await response.json()
            } catch {
              // Use default error message
            }
            // Track HTTP error before throwing
            this._trackServiceError(
              new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`),
              {
                endpoint,
                methodName: options.methodName,
                status: response.status,
                statusText: response.statusText
              }
            )
            const httpErr = new Error(error.message || error.error || 'Request failed', { cause: error })
            httpErr.status = response.status
            throw httpErr
          }

          return response.status === 204 ? null : response.json()
        } catch (error) {
          const wrapped = error?.status !== undefined ? error : _wrapRequestError(error, url)
          if (_shouldRetryRequest(wrapped, method, options.methodName, attempt, maxRetries)) {
            await _sleep(_retryDelay(attempt))
            continue
          }
          this._trackServiceError(wrapped, { endpoint, methodName: options.methodName })
          throw wrapped
        }
      }
    }

    // Identical concurrent GETs share one round-trip (workspace boot F6 —
    // see _dedupeInflightGet above). Key = URL + final headers (auth scope
    // included). Mutations, aborted-able and body-carrying requests never
    // enter the table.
    if (_canDedupeRequest(method, options)) {
      const key = _dedupeGetKey(url, { ...defaultHeaders, ...options.headers })
      return _dedupeInflightGet(key, runFetch)
    }
    return runFetch()
  }

  // Telemetry-aware request against a fully-qualified URL (i.e. not the
  // `${apiUrl}/core` core surface). Mirrors `_request`'s auth/tracking/retry
  // semantics so off-core wrappers (workspace-project, KV worker, Supabase
  // passthrough) don't have to re-implement them and silently lose telemetry.
  //
  // `authHeader` overrides the TokenManager-derived header (e.g. when the
  // wrapper takes a Supabase JWT instead of the Symbols access token).
  // Pass `null` to send unauthenticated. Omit to use TokenManager.
  async _requestExternal (url, options = {}) {
    const { methodName, authHeader, ...init } = options
    const defaultHeaders = {}
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json'
      // fetch() does NOT serialize plain objects — an object body coerces
      // to the string "[object Object]", which the server's body-parser
      // rejects with 400 "Request body is not valid JSON". Every
      // AiService caller passes plain objects, so encode them here.
      // Strings, Blobs, streams and typed arrays pass through untouched.
      const isPlainJson = init.body !== null && typeof init.body === 'object' &&
        (Array.isArray(init.body) || Object.getPrototypeOf(init.body) === Object.prototype)
      if (isPlainJson) init.body = JSON.stringify(init.body)
    }

    if (authHeader === undefined && this._requiresInit(methodName) && this._tokenManager) {
      try {
        await this._tokenManager.ensureValidToken()
        const header = this._tokenManager.getAuthHeader()
        if (header) defaultHeaders.Authorization = header
      } catch (error) {
        logger.warn('Token management failed, proceeding without authentication:', error)
      }
    } else if (authHeader) {
      defaultHeaders.Authorization = authHeader
    }

    const method = String(init.method || 'GET').toUpperCase()
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    const runFetch = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(url, {
            ...init,
            headers: { ...defaultHeaders, ...init.headers }
          })

          if (!response.ok) {
            let error = { message: `HTTP ${response.status}: ${response.statusText}` }
            try { error = await response.json() } catch {}
            this._trackServiceError(
              new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`),
              { endpoint: url, methodName, status: response.status, statusText: response.statusText }
            )
            const httpErr = new Error(error.message || error.error || 'Request failed', { cause: error })
            httpErr.status = response.status
            throw httpErr
          }

          if (response.status === 204) return null
          const text = await response.text()
          if (!text) return null
          try { return JSON.parse(text) } catch { return text }
        } catch (error) {
          const wrapped = error?.status !== undefined ? error : _wrapRequestError(error, url)
          if (_shouldRetryRequest(wrapped, method, methodName, attempt, maxRetries)) {
            await _sleep(_retryDelay(attempt))
            continue
          }
          this._trackServiceError(wrapped, { endpoint: url, methodName })
          throw wrapped
        }
      }
    }

    // Same identical-GET dedupe as _request (workspace boot F6) — off-core
    // wrappers (workspace-project, KV worker) stampede at boot too.
    if (_canDedupeRequest(method, init)) {
      const key = _dedupeGetKey(url, { ...defaultHeaders, ...init.headers })
      return _dedupeInflightGet(key, runFetch)
    }
    return runFetch()
  }

  // Envelope-aware request: expects the server to respond with
  // { success, data, message } and unwraps to `data` on success or throws
  // `new Error(message)` otherwise. Collapses the ~5 lines of boilerplate
  // that every service method repeats.
  //
  // `raw: true` opts out of the `.data` unwrap for controllers that reply
  // flat (`{success, ...fields}` with no `data` envelope) — throw-on-
  // `!success` behavior is preserved, but the full response is returned so
  // the caller can pick its own fields. Use this instead of hand-rolling
  // `_requireReady` → `_request` → `if (!response || response.success ===
  // false) throw` at the call site.
  async _call (methodName, endpoint, { method = 'GET', body, headers, raw = false } = {}) {
    this._requireReady(methodName)
    const init = { method, methodName }
    if (headers) init.headers = headers
    if (body !== undefined) init.body = body instanceof FormData ? body : JSON.stringify(body)

    const response = await this._request(endpoint, init)

    if (raw) {
      if (!response || response.success === false) {
        throw new Error(response?.message || `${methodName} failed`)
      }
      return response
    }

    // Tolerate both enveloped {success, data, message} and bare payloads.
    if (response && typeof response === 'object' && 'success' in response) {
      if (response.success) return response.data
      throw new Error(response.message || `${methodName} failed`)
    }
    return response
  }

  // Helper method to determine if a method requires initialization
  _requiresInit (methodName) {
    const noInitMethods = new Set([
      'register',
      'login',
      'googleAuth',
      'googleAuthCallback',
      'githubAuth',
      // Native-shell OAuth redemption — runs pre-auth on /login (the deep
      // link delivers the xt BEFORE any session exists), so no bearer token.
      'exchangeNativeAuthToken',
      'requestPasswordReset',
      'confirmPasswordReset',
      'confirmRegistration',
      'verifyEmail',
      'getPlans',
      'getPlan',
      'listPublicProjects',
      'getPublicProject',
      // Anonymous meet guest flow — unauthenticated visitors join public
      // rooms through the waiting room; no bearer token is attached.
      'meetGuestMeta',
      'meetGuestRequest',
      'meetGuestStatus',
      'meetGuestToken',
      // Demo flow — unauthenticated visitor starts a demo session
      'startDemo',
      'enterDemo',
      // Public storefront catalog reads (StorefrontService, tickets/server.md
      // "storefront catalog read API") — anonymous shoppers, no bearer token.
      'listStorefrontProducts',
      'getStorefrontProduct',
      'listStorefrontCollection',
      // Job-application pipeline (tickets/server.md "job-application
      // pipeline backend") — public job listings + the public application
      // WRITE, same anonymous no-bearer-token surface as the catalog reads.
      'listStorefrontJobs',
      'getStorefrontJob',
      'applyToStorefrontJob',
      // Storefront customer identity (tickets/server.md "storefront customer
      // identity layer", NAT-V1-25/27/28) — register/login/OTP/reset are the
      // anonymous-visitor surface itself, no bearer token. `getStorefrontCustomerMe`
      // is ALSO listed here even though it IS authenticated — its identity is
      // a storefront-customer token passed explicitly via an options.headers
      // override, never the SDK's own TokenManager session (see
      // StorefrontService.js header for why the two must never mix).
      'registerStorefrontCustomer',
      'loginStorefrontCustomer',
      'requestStorefrontCustomerOtp',
      'verifyStorefrontCustomerOtp',
      'resetStorefrontCustomerPassword',
      'getStorefrontCustomerMe'
    ])
    return !noInitMethods.has(methodName)
  }

  // Register subdomain DNS records via cloudflare-dns worker
  // Creates: {name}.symbo.ls and *.{name}.symbo.ls
  async _createSubdomainRecords (name) {
    const dnsUrl = this._context?.dnsWorkerUrl || environment.dnsWorkerUrl
    const dnsKey = this._context?.dnsApiKey || environment.dnsApiKey
    if (!dnsUrl) {
      logger.warn('DNS worker URL not configured, skipping subdomain registration')
      return
    }

    const resp = await fetch(`${dnsUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(dnsKey ? { Authorization: `Bearer ${dnsKey}` } : {})
      },
      body: JSON.stringify({ name })
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }))
      throw new Error(err.error || `DNS registration failed (${resp.status})`)
    }

    return resp.json()
  }

  // SSE subscription helper for streaming endpoints (e.g. /tickets/stream).
  //
  // Constructs the full URL as:
  //   ${apiUrl}/core${path}?access_token=<jwt>[&filter[key]=val...]
  //
  // EventSource does not support custom headers, so the auth token is passed
  // as `access_token` query param. The main server's SSE handler must accept
  // either Authorization header OR access_token query param.
  //
  // Browser: uses native EventSource.
  // Node.js: dynamically imports the optional `eventsource` package. If it is
  // not installed, _sseSubscribe throws a clear error message.
  //
  // Event naming conventions from server (default / tickets path):
  //   tickets.snapshot → { type: 'snapshot', tickets: [...] }
  //   tickets.insert   → { type: 'tickets.insert', ticket: {} }
  //   tickets.update   → { type: 'tickets.update', ticket: {} }
  //   tickets.delete   → { type: 'tickets.delete', ticket: {} }
  //
  // Generalization (spec §4.1 — meet realtime cutover): callers that need a
  // different event vocabulary (e.g. the meet stream's `meet.room.*`,
  // `meet.waiting.*`, …) pass `opts.events` — an array of
  // `{ name, frame }` descriptors. For each `name`, an `addEventListener` is
  // wired that parses the SSE frame's JSON `data` and calls
  // `onEvent(frame(parsedData, name))`. When `opts.events` is omitted the
  // historical tickets listeners are installed verbatim, so the tickets/docs
  // callers are byte-unchanged.
  //
  // `opts.flatParams` (default false): the tickets/docs server controllers
  // historically read `filter[key]` nested params; the meet stream controller
  // reads FLAT query params (`?roomId=…&tables=…`). Setting `flatParams: true`
  // serializes the filter as flat `?key=value` so the meet route's
  // `req.query.roomId` / `req.query.tables` resolve. Default keeps the legacy
  // `filter[key]=value` shape.
  //
  // Returns an unsubscribe() function that closes the EventSource and
  // cancels any pending reconnect timers.
  _sseSubscribe (path, filter = {}, onEvent, opts = {}) {
    if (typeof onEvent !== 'function') {
      throw new Error(`_sseSubscribe: onEvent must be a function`)
    }

    const flatParams = opts?.flatParams === true
    // Default event vocabulary = the historical tickets listeners. Kept here
    // (not inlined below) so the meet path can swap it out without touching
    // the connection/reconnect machinery.
    const events = Array.isArray(opts?.events) && opts.events.length
      ? opts.events
      : [
          { name: 'tickets.snapshot', frame: (data) => ({ type: 'snapshot', tickets: data.tickets || data }) },
          { name: 'tickets.insert', frame: (data) => ({ type: 'tickets.insert', ticket: data.ticket || data }) },
          { name: 'tickets.update', frame: (data) => ({ type: 'tickets.update', ticket: data.ticket || data }) },
          { name: 'tickets.delete', frame: (data) => ({ type: 'tickets.delete', ticket: data.ticket || data }) }
        ]

    let es = null
    let reconnectTimer = null
    let destroyed = false
    let attempt = 0
    const MAX_BACKOFF_MS = 8000

    const _buildUrl = () => {
      const params = new URLSearchParams()
      // Auth token as query param — EventSource cannot set headers.
      if (this._tokenManager) {
        const token = this._tokenManager.getAccessToken?.()
        if (token) params.set('access_token', token)
      }
      // Serialize filter — flat `key=value` (meet stream route) or the
      // historical nested `filter[key]=value` (tickets/docs routes).
      for (const [k, v] of Object.entries(filter || {})) {
        if (v !== undefined && v !== null) {
          params.set(flatParams ? k : `filter[${k}]`, String(v))
        }
      }
      const qs = params.toString()
      return `${this._apiUrl}/core${path}${qs ? `?${qs}` : ''}`
    }

    const _connect = async () => {
      if (destroyed) return

      let EventSourceImpl
      if (typeof EventSource !== 'undefined') {
        EventSourceImpl = EventSource
      } else {
        // Node.js: try optional `eventsource` npm package.
        // The specifier is held in a variable so static-analysis bundlers
        // (Parcel/Webpack/Vite) don't try to resolve it at build time —
        // browser bundles short-circuit on `typeof EventSource !== 'undefined'`
        // and never reach this branch, so they shouldn't pay a bundle cost
        // (or a missing-module build error) for a Node-only fallback.
        const _esPkg = 'eventsource'
        try {
          const mod = await import(/* @vite-ignore */ _esPkg)
          EventSourceImpl = mod.default || mod.EventSource || mod
        } catch {
          throw new Error(
            '[sdk._sseSubscribe] EventSource is not available in this environment. ' +
            'In Node.js, install the optional `eventsource` npm package: ' +
            '`bun add eventsource` or `npm install eventsource`.'
          )
        }
      }

      const url = _buildUrl()
      es = new EventSourceImpl(url)

      // Wire each declared event name → parse JSON `data` → frame → onEvent.
      // A frame throwing or a malformed payload must not kill the listener.
      for (const { name, frame } of events) {
        es.addEventListener(name, (evt) => {
          try {
            const data = JSON.parse(evt.data)
            const framed = typeof frame === 'function' ? frame(data, name) : data
            if (framed !== undefined) onEvent(framed)
          } catch {}
        })
      }

      es.addEventListener('error', () => {
        if (destroyed) return
        // Close current source before reconnecting.
        try { es.close() } catch {}
        es = null
        attempt += 1
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)
        reconnectTimer = setTimeout(() => {
          if (!destroyed) _connect()
        }, delay)
      })

      // Reset backoff on first successful message.
      es.addEventListener('open', () => { attempt = 0 })
    }

    _connect()

    return function unsubscribe () {
      destroyed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (es) {
        try { es.close() } catch {}
        es = null
      }
    }
  }

  // Streaming POST helper — for endpoints that POST a body and respond with
  // SSE-framed deltas (`data: {"text": "..."}\n\n` style). Used by
  // ChatService.stream() to wire the Mongo-backed AI chat into the same
  // wire format the legacy Supabase ai-chat edge function emitted.
  //
  // The callbacks fire as deltas arrive:
  //   onChunk(deltaText)       — for each `data: {"text": "<delta>"}` frame
  //   onDone(donePayload)      — for the trailing `data: {"done": true, ...}` frame
  //                              (payload includes action, assistantMessageId, thread)
  //   onError(err)             — on transport error or `data: {"error": ...}` frame
  //
  // Returns a cancel() function that aborts the in-flight request.
  _streamPost (path, body, { onChunk, onDone, onError } = {}) {
    this._requireReady('_streamPost')
    const url = `${this._apiUrl}/core${path}`
    const controller = new AbortController()

    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    if (this._tokenManager) {
      const token = this._tokenManager.getAccessToken?.()
      if (token) headers.Authorization = `Bearer ${token}`
    }

    const safe = (fn, arg) => {
      if (typeof fn !== 'function') return
      try { fn(arg) } catch (_) { /* swallow downstream */ }
    }

    ;(async () => {
      let res
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body || {}),
          signal: controller.signal
        })
      } catch (err) {
        if (err?.name !== 'AbortError') safe(onError, err)
        return
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        // Friendly message — the raw `stream HTTP <code>: <body>` string used
        // to bypass every client-side sanitizer and land verbatim in the
        // assistant bubble. Detail stays on the error object for debugging.
        const err = new Error(
          res.status >= 500
            ? 'The AI service is temporarily unavailable — please try again.'
            : `The AI request was rejected (HTTP ${res.status}).`
        )
        err.status = res.status
        err.code = `STREAM_HTTP_${res.status}`
        err.detail = text.slice(0, 300)
        safe(onError, err)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (!json || json === '[DONE]') continue
            let parsed
            try { parsed = JSON.parse(json) } catch { continue }
            if (parsed.error) { safe(onError, new Error(parsed.error)); continue }
            if (parsed.done) { safe(onDone, parsed); continue }
            if (typeof parsed.text === 'string') safe(onChunk, parsed.text)
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') safe(onError, err)
      } finally {
        // reader.cancel() returns a PROMISE that rejects with AbortError
        // ("BodyStreamBuffer was aborted") when the stream was already
        // aborted — a bare try/catch only stops the sync throw, leaving an
        // unhandled rejection in the console on every completed turn.
        try { reader.cancel()?.catch?.(() => {}) } catch {}
      }
    })()

    return () => {
      try { controller.abort() } catch {}
    }
  }

  // Off-core GET-SSE helper — for server-sent-event streams served at a
  // fully-qualified URL (not `${apiUrl}/core…`) that emit named frames in
  // the `event: <name>\ndata: <json>\n\n` shape. Unlike `_sseSubscribe`
  // (EventSource, query-param auth) this uses fetch GET so the bearer token
  // travels in an Authorization header and the read loop is identical to
  // `_streamPost` — only the framing (event+data) and method (GET) differ.
  //
  // Reconnect (tickets/opus2 "SSE-first moved the fragile link to the
  // stream, and the stream had no reconnect" — 2026-08-14 audit): this
  // stream is long-lived by server design (the AI-turn conversation
  // stream stays open until the CLIENT disconnects — see
  // AgentConversationController/AgentWorkspaceConversationController's
  // `streamConversation`, which only tears down on `req.on('close')`). So
  // when the read loop ends any other way — a thrown transport error OR a
  // clean `done` from `reader.read()` (a dropped connection reads
  // identically to a graceful close at the fetch layer: LB idle-timeout,
  // proxy cut, network blip, server restart) — that is the connection
  // dying, not the server finishing, and we reconnect with the same
  // 1s→8s exponential backoff `_sseSubscribe` uses. An explicit HTTP
  // error response (4xx/5xx on the initial connect) is NOT retried here —
  // that is a real rejection (bad conversation id, auth), not a dropped
  // connection, and is surfaced once via onError.
  //
  // No Last-Event-ID: this endpoint's SSE frames carry no `id:` field
  // (server never sets one — verified against both
  // `AgentConversationController` and `AgentWorkspaceConversationController`
  // in server/), so a Last-Event-ID resume header would be a no-op even if
  // sent. Resume instead relies on what the server DOES already do on every
  // connect: emit a `conversation.snapshot` frame with the latest messages.
  // A reconnect after a mid-turn drop re-requests the same URL and gets a
  // fresh snapshot — callers that want to recover an answer persisted while
  // disconnected should read it off `conversation.snapshot`, not assume a
  // resume picks up exactly where the old connection left off.
  //
  // Callbacks:
  //   onEvent({ event, data })  — once per complete frame; `data` is parsed JSON
  //   onError(err)              — on a non-retryable transport / HTTP error
  //
  // Returns a cancel() function that aborts the in-flight request and stops
  // any pending reconnect.
  _streamSSE (fullUrl, { onEvent, onError } = {}) {
    const headers = { Accept: 'text/event-stream' }
    if (this._tokenManager) {
      const token = this._tokenManager.getAccessToken?.()
      if (token) headers.Authorization = `Bearer ${token}`
    }

    const safe = (fn, arg) => {
      if (typeof fn !== 'function') return
      try { fn(arg) } catch (_) { /* swallow downstream */ }
    }

    // Parse one complete SSE frame (lines separated by \n within the frame).
    // A line starting `event:` sets the event name; lines starting `data:`
    // accumulate the JSON payload. Returns null for comment-only / empty
    // frames so the caller can skip them.
    const parseFrame = (frame) => {
      let event = 'message'
      const dataLines = []
      for (const raw of frame.split('\n')) {
        if (raw.startsWith('event:')) {
          event = raw.slice(6).trim()
        } else if (raw.startsWith('data:')) {
          dataLines.push(raw.slice(5).replace(/^ /, ''))
        }
      }
      if (!dataLines.length) return null
      const json = dataLines.join('\n')
      if (json === '[DONE]') return null
      let data
      try { data = JSON.parse(json) } catch { return null }
      return { event, data }
    }

    let controller = null
    let destroyed = false
    let attempt = 0
    let reconnectTimer = null
    const MAX_BACKOFF_MS = 8000

    const scheduleReconnect = () => {
      if (destroyed) return
      attempt += 1
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (!destroyed) _connect()
      }, delay)
    }

    const _connect = () => {
      if (destroyed) return
      controller = new AbortController()

      ;(async () => {
        let res
        try {
          res = await fetch(fullUrl, { method: 'GET', headers, signal: controller.signal })
        } catch (err) {
          if (destroyed || err?.name === 'AbortError') return
          // Pre-connect transport failure — indistinguishable from a
          // mid-stream drop from the caller's POV; retry with backoff
          // instead of surfacing a terminal error for what may be a
          // momentary blip (nodemon restart, brief network loss).
          scheduleReconnect()
          return
        }
        if (destroyed) return
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '')
          // Friendly message — the raw `stream HTTP <code>: <body>` string
          // used to bypass every client-side sanitizer and land verbatim in
          // the assistant bubble. Detail stays on the error object for
          // debugging. Not retried: a real HTTP rejection (bad conversation
          // id, expired auth) will not self-heal by reconnecting.
          const err = new Error(
            res.status >= 500
              ? 'The AI service is temporarily unavailable — please try again.'
              : `The AI request was rejected (HTTP ${res.status}).`
          )
          err.status = res.status
          err.code = `STREAM_HTTP_${res.status}`
          err.detail = text.slice(0, 300)
          safe(onError, err)
          return
        }
        // Connection established — reset backoff for the NEXT drop.
        attempt = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let readErr = null
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            // Frames are delimited by a blank line (\n\n). Keep the trailing
            // partial frame in the buffer until its terminator arrives.
            const frames = buffer.split('\n\n')
            buffer = frames.pop() || ''
            for (const frame of frames) {
              const parsed = parseFrame(frame)
              if (parsed) safe(onEvent, parsed)
            }
          }
        } catch (err) {
          readErr = err
        } finally {
          // reader.cancel() returns a PROMISE that rejects with AbortError
          // ("BodyStreamBuffer was aborted") when the stream was already
          // aborted — a bare try/catch only stops the sync throw, leaving an
          // unhandled rejection in the console on every completed turn.
          try { reader.cancel()?.catch?.(() => {}) } catch {}
        }
        if (destroyed) return
        if (readErr && readErr.name === 'AbortError') return
        // Either a thrown (non-abort) read error, or the loop ended via a
        // clean `done` — both mean the connection is gone while the caller
        // never asked us to stop. Reconnect; see the doc comment above.
        scheduleReconnect()
      })()
    }

    _connect()

    return function cancel () {
      destroyed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (controller) {
        try { controller.abort() } catch {}
        controller = null
      }
    }
  }

  // Cleanup method
  destroy () {
    if (this._tokenManager) {
      this._tokenManager.destroy()
      this._tokenManager = null
    }
    this._ready = false
    this._setReady(false)
  }
}
