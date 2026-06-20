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
      this._trackServiceError(error, { endpoint, methodName: options.methodName })
      throw _wrapRequestError(error, url)
    }
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
      this._trackServiceError(error, { endpoint: url, methodName })
      if (error?.status) throw error
      throw _wrapRequestError(error, url)
    }
  }

  // Envelope-aware request: expects the server to respond with
  // { success, data, message } and unwraps to `data` on success or throws
  // `new Error(message)` otherwise. Collapses the ~5 lines of boilerplate
  // that every service method repeats.
  async _call (methodName, endpoint, { method = 'GET', body, headers } = {}) {
    this._requireReady(methodName)
    const init = { method, methodName }
    if (headers) init.headers = headers
    if (body !== undefined) init.body = body instanceof FormData ? body : JSON.stringify(body)

    const response = await this._request(endpoint, init)
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
      'startDemo'
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
        safe(onError, new Error(`stream HTTP ${res.status}: ${text.slice(0, 200)}`))
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
  // Callbacks:
  //   onEvent({ event, data })  — once per complete frame; `data` is parsed JSON
  //   onError(err)              — on transport / parse error
  //
  // Returns a cancel() function that aborts the in-flight request.
  _streamSSE (fullUrl, { onEvent, onError } = {}) {
    const controller = new AbortController()

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

    ;(async () => {
      let res
      try {
        res = await fetch(fullUrl, { method: 'GET', headers, signal: controller.signal })
      } catch (err) {
        if (err?.name !== 'AbortError') safe(onError, _wrapRequestError(err, fullUrl))
        return
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        safe(onError, new Error(`stream HTTP ${res.status}: ${text.slice(0, 200)}`))
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
