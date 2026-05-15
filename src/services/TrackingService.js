/**
 * TrackingService — observability surface on the Symbols SDK.
 *
 * Backed by @symbo.ls/analyzing (replaces Grafana Faro). The public API is
 * preserved verbatim so existing callers (trackEvent, trackError,
 * captureException, logMessage, addBreadcrumb, trackMeasurement, trackView,
 * setUser, setSession, setGlobalAttribute*, flushQueue, getClient,
 * isEnabled, isInitialized, destroy, configure, configureTracking,
 * updateContext) continue to work unchanged.
 *
 * Under the hood, every Faro-shaped call routes through createAnalyzing's
 * native primitives (capture / captureError / captureMessage / addMeasurement
 * / identify / setContext / setTag), which batch into envelopes and ship
 * to the workspace-project worker via the in-SDK transport at flush time
 * (this._context.services.workspaceProject.analyzed.ingest). RLS in
 * Supabase (0114_analyzed_rls.sql) gates rows by workspace_id from the
 * caller's JWT — clients can't lie about tenant scope.
 *
 * The legacy Grafana URL + transports + instrumentations config still work
 * as inert pass-through so consumers that override transports (e.g. local
 * dev demos) can plug their own fetcher in via `options.tracking.transport`.
 */

import { BaseService } from './BaseService.js'
import environment from '../config/environment.js'
import { logger } from '../utils/logger.js'
import { createAnalyzing } from '@symbo.ls/analyzing'

const DEFAULT_MAX_QUEUE_SIZE = 100

const isBrowserEnvironment = () => typeof window !== 'undefined'

const DEFAULT_TRACKING_OPTIONS = {
  // Enabled by default unless explicitly disabled via SDK options
  enabled: true,
  sessionTracking: true,
  // `enableTracing` was a Faro-specific knob — kept for option-shape parity
  // but no longer affects behavior. createAnalyzing captures perf via
  // PerformanceObserver, not tracing spans.
  enableTracing: true,
  maxQueueSize: DEFAULT_MAX_QUEUE_SIZE,
  // `transport` lets callers override the default SDK-routed transport
  // with their own (envelope) => Promise<{ok}> fn. When set, the analyzing
  // client uses it instead of routing through workspaceProject.analyzed.
  transport: null,
  globalAttributes: {},
  user: null
}

const sanitizeAttributes = (value) => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    logger.warn('[TrackingService] Failed to sanitize attributes:', error)
    return { ...value }
  }
}

// Build a Faro-API-compatible shim around a createAnalyzing instance so the
// pre-existing `_withClient(callback)` call sites work unchanged. The shim
// keeps the same method names + arity Faro's client.api exposed.
const buildAnalyzingShim = (analyzing) => {
  // Mutable view/session attributes — Faro tracks these as separate
  // setView/setSession surfaces. We model them as long-lived context tags
  // so subsequent envelopes include them.
  const viewState = { current: null }
  const sessionState = { current: null }

  return {
    api: {
      pushEvent: (name, attributes, domain, options) => {
        analyzing.capture('info', String(name || ''), {
          kind: 'event',
          domain: domain || null,
          attributes: attributes || {},
          ...(options && typeof options === 'object' ? options : {})
        })
      },

      pushError: (err, options) => {
        analyzing.captureError(err, options?.context || options || {})
      },

      pushLog: (messages, options) => {
        const msg = Array.isArray(messages)
          ? messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
          : String(messages || '')
        analyzing.capture(options?.level || 'info', msg, options?.context || {})
      },

      pushMeasurement: (payload, _options) => {
        const v = payload?.values
        const numeric =
          typeof v === 'object' && v !== null
            ? (v.value ?? Object.values(v).find((n) => typeof n === 'number'))
            : v
        analyzing.addMeasurement(payload?.type || 'measurement', Number(numeric) || 0, 'ms')
      },

      setView: (view) => {
        viewState.current = view || null
        analyzing.setContext('view', view || null)
      },

      setUser: (user) => {
        analyzing.identify(
          user
            ? {
                userId: user.id || user.email || null,
                traits: user
              }
            : null
        )
      },

      setSession: (session, _options) => {
        sessionState.current = session || null
        analyzing.setContext('session', session || null)
      }
    },
    destroy: () => analyzing.shutdown()
  }
}

export class TrackingService extends BaseService {
  constructor ({ context, options } = {}) {
    super({ context, options })

    this._client = null            // analyzing-shim ({ api, destroy })
    this._analyzing = null         // raw createAnalyzing return value
    this._queue = []
    this._initialized = false
    this._enabled = DEFAULT_TRACKING_OPTIONS.enabled
    this._runtimeConfig = {}
    this._setupPromise = null

    this._trackingOptions = {
      ...DEFAULT_TRACKING_OPTIONS,
      ...(options?.tracking || {})
    }

    this._globalAttributes = sanitizeAttributes(
      this._trackingOptions.globalAttributes || {}
    )
    this._trackingOptions.globalAttributes = { ...this._globalAttributes }
  }

  async init ({ context = {}, options = {} } = {}) {
    this.updateContext(context)

    this._trackingOptions = {
      ...DEFAULT_TRACKING_OPTIONS,
      ...this._trackingOptions,
      ...(this._options?.tracking || {}),
      ...(options.tracking || {})
    }

    this._globalAttributes = sanitizeAttributes(
      this._trackingOptions.globalAttributes || {}
    )

    this._enabled = this._trackingOptions.enabled !== false

    if (!this._enabled) {
      this._setReady()
      return this
    }

    if (!isBrowserEnvironment()) {
      this._enabled = false
      this._setReady()
      return this
    }

    this._runtimeConfig = this._buildRuntimeConfig()

    if (this._initialized) {
      this._setReady()
      return this
    }

    if (!this._setupPromise) {
      this._setupPromise = this._setupAnalyzingClient(this._runtimeConfig)
    }

    await this._setupPromise

    return this
  }

  updateContext (context) {
    super.updateContext(context)

    const trackingContext = context?.tracking

    if (trackingContext) {
      if (Object.hasOwn(trackingContext, 'user')) {
        this.setUser(trackingContext.user, { queue: false })
      }

      if (Object.hasOwn(trackingContext, 'globalAttributes')) {
        this.setGlobalAttributes(trackingContext.globalAttributes)
      }
    }
  }

  configureTracking (trackingOptions = {}) {
    if (!trackingOptions || typeof trackingOptions !== 'object') {
      return this
    }

    this._trackingOptions = {
      ...this._trackingOptions,
      ...trackingOptions
    }

    if (Object.hasOwn(trackingOptions, 'globalAttributes')) {
      this.setGlobalAttributes(trackingOptions.globalAttributes)
    }

    if (Object.hasOwn(trackingOptions, 'user')) {
      this.setUser(trackingOptions.user)
      this._trackingOptions.user = trackingOptions.user
    }

    return this
  }

  configure (trackingOptions = {}) {
    return this.configureTracking(trackingOptions)
  }

  trackEvent (name, attributes, options = {}) {
    if (!name) {
      throw new Error('Event name is required for trackEvent')
    }

    const mergedAttributes = this._mergeAttributes(attributes)
    const eventOptions = options && typeof options === 'object' ? options : {}
    const { domain, queue, ...restOptions } = eventOptions
    const eventDomain = Object.hasOwn(eventOptions, 'domain') ? domain : null

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.pushEvent) {
        logger.warn('[TrackingService] pushEvent API not available')
        return
      }
      api.pushEvent(name, mergedAttributes, eventDomain, restOptions)
    }

    if (Object.hasOwn(eventOptions, 'queue')) {
      this._withClient(invokeTracking, { queue: Boolean(queue) })
    } else {
      this._withClient(invokeTracking)
    }
  }

  trackError (error, options = {}) {
    if (!error) {
      return
    }

    const err =
      error instanceof Error
        ? error
        : new Error(
            typeof error === 'string' ? error : 'Unknown error captured by TrackingService'
          )

    const isContextOnly =
      options &&
      typeof options === 'object' &&
      options !== null &&
      !(
        'context' in options ||
        'type' in options ||
        'stackFrames' in options ||
        'skipDedupe' in options ||
        'spanContext' in options ||
        'timestampOverwriteMs' in options ||
        'originalError' in options
      )

    const normalizedOptions = isContextOnly ? { context: options } : options || {}

    const mergedContext = this._mergeAttributes(normalizedOptions.context)
    const apiOptions = {
      ...normalizedOptions,
      ...(Object.keys(mergedContext).length > 0 ? { context: mergedContext } : {})
    }

    const queueConfigured = Object.hasOwn(apiOptions, 'queue')
    const { queue, ...errorOptions } = apiOptions

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.pushError) {
        logger.warn('[TrackingService] pushError API not available')
        return
      }
      api.pushError(err, errorOptions)
    }

    if (queueConfigured) {
      this._withClient(invokeTracking, { queue: Boolean(queue) })
    } else {
      this._withClient(invokeTracking)
    }
  }

  captureException (error, options = {}) {
    this.trackError(error, options)
  }

  logMessage (message, level = 'info', context = null) {
    if (!message) {
      return
    }

    const payload = Array.isArray(message) ? message : [message]
    const logContext = this._mergeAttributes(context)
    const severity = level || 'info'

    const options = {
      level: severity,
      ...(Object.keys(logContext).length > 0 ? { context: logContext } : {})
    }

    this._withClient(client => {
      const api = client?.api
      if (!api?.pushLog) {
        logger.warn('[TrackingService] pushLog API not available')
        return
      }
      api.pushLog(payload, options)
    })
  }

  logDebug (message, context) {
    this.logMessage(message, 'debug', context)
  }

  logInfo (message, context) {
    this.logMessage(message, 'info', context)
  }

  logWarning (message, context) {
    this.logMessage(message, 'warn', context)
  }

  logWarn (message, context) {
    this.logWarning(message, context)
  }

  logErrorMessage (message, context) {
    this.logMessage(message, 'error', context)
  }

  logError (message, context) {
    this.logErrorMessage(message, context)
  }

  addBreadcrumb (message, attributes) {
    if (!message) {
      return
    }

    const breadcrumbAttributes = {
      category: 'custom',
      ...sanitizeAttributes(attributes || {}),
      message
    }

    this.trackEvent('breadcrumb', breadcrumbAttributes)
  }

  trackMeasurement (type, values, options = {}) {
    if (!type) {
      throw new Error('Measurement type is required for trackMeasurement')
    }

    if (values == null) {
      throw new Error('Measurement values are required for trackMeasurement')
    }

    const measurementValues =
      typeof values === 'object' && !Array.isArray(values)
        ? sanitizeAttributes(values)
        : { value: Number(values) }

    if (typeof measurementValues.value === 'number' && Number.isNaN(measurementValues.value)) {
      throw new Error('Measurement value must be a valid number')
    }

    const measurementOptions = options && typeof options === 'object' ? options : {}
    const {
      attributes: measurementAttributesOption,
      context: measurementContextOption,
      queue,
      ...transportOptions
    } = measurementOptions

    const hasGlobalAttributes = Object.keys(this._globalAttributes).length > 0

    const attributePayload = measurementAttributesOption
      ? this._mergeAttributes(measurementAttributesOption)
      : hasGlobalAttributes
        ? { ...this._globalAttributes }
        : {}

    const payload = {
      type,
      values: measurementValues,
      ...(attributePayload && Object.keys(attributePayload).length > 0
        ? { attributes: attributePayload }
        : {})
    }

    const context = measurementContextOption
      ? this._mergeAttributes(measurementContextOption)
      : hasGlobalAttributes
        ? { ...this._globalAttributes }
        : {}
    const apiOptions = {
      ...transportOptions,
      ...(Object.keys(context).length > 0 ? { context } : {})
    }

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.pushMeasurement) {
        logger.warn('[TrackingService] pushMeasurement API not available')
        return
      }
      api.pushMeasurement(payload, apiOptions)
    }

    if (Object.hasOwn(measurementOptions, 'queue')) {
      this._withClient(invokeTracking, { queue: Boolean(queue) })
    } else {
      this._withClient(invokeTracking)
    }
  }

  trackView (name, attributes) {
    if (!name) {
      throw new Error('View name is required for trackView')
    }

    const viewAttributes = sanitizeAttributes(attributes || {})
    const merged = this._mergeAttributes(viewAttributes)

    this._withClient(client => {
      const api = client?.api
      if (!api?.setView) {
        logger.warn('[TrackingService] setView API not available')
        return
      }
      api.setView({ name, ...merged })
    })
  }

  setUser (user, options = {}) {
    if (user == null) {
      this.clearUser()
      return
    }

    if (typeof user !== 'object') {
      throw new Error('User must be an object')
    }

    const userData = sanitizeAttributes(user)
    const queueConfigured =
      options && typeof options === 'object' && Object.hasOwn(options, 'queue')

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.setUser) {
        logger.warn('[TrackingService] setUser API not available')
        return
      }
      api.setUser(userData)
    }

    if (queueConfigured) {
      this._withClient(invokeTracking, { queue: Boolean(options.queue) })
    } else {
      this._withClient(invokeTracking)
    }
  }

  clearUser () {
    this._withClient(client => {
      const api = client?.api
      if (api?.setUser) {
        api.setUser(null)
      } else {
        logger.warn('[TrackingService] setUser API not available')
      }
    })
  }

  setSession (session, options = {}) {
    if (session == null) {
      this.clearSession()
      return
    }

    if (typeof session !== 'object') {
      throw new Error('Session must be an object')
    }

    const sessionData = sanitizeAttributes(session)
    const queueConfigured = Object.hasOwn(options, 'queue')
    const { queue, ...sessionOptions } = options

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.setSession) {
        logger.warn('[TrackingService] setSession API not available')
        return
      }
      api.setSession(sessionData, sessionOptions)
    }

    if (queueConfigured) {
      this._withClient(invokeTracking, { queue: Boolean(queue) })
    } else {
      this._withClient(invokeTracking)
    }
  }

  clearSession () {
    this._withClient(client => {
      const api = client?.api
      if (api?.setSession) {
        api.setSession(null)
      } else {
        logger.warn('[TrackingService] setSession API not available')
      }
    })
  }

  setGlobalAttributes (attributes) {
    if (attributes == null) {
      this._globalAttributes = {}
      this._trackingOptions.globalAttributes = {}
      return
    }

    if (typeof attributes !== 'object') {
      throw new Error('Global attributes must be an object')
    }

    const sanitized = sanitizeAttributes(attributes)
    this._globalAttributes = sanitized
    this._trackingOptions.globalAttributes = sanitized
  }

  setGlobalAttribute (key, value) {
    if (!key) {
      throw new Error('Global attribute key is required')
    }

    const sanitized = sanitizeAttributes({ [key]: value })
    this._globalAttributes = {
      ...this._globalAttributes,
      ...sanitized
    }
    this._trackingOptions.globalAttributes = { ...this._globalAttributes }
  }

  removeGlobalAttribute (key) {
    if (!key) {
      throw new Error('Global attribute key is required to remove it')
    }

    if (Object.hasOwn(this._globalAttributes, key)) {
      const rest = { ...this._globalAttributes }
      delete rest[key]
      this._globalAttributes = rest
      this._trackingOptions.globalAttributes = rest
    }
  }

  _mergeAttributes (attributes) {
    const hasInput = attributes && typeof attributes === 'object'
    const sanitized = hasInput ? sanitizeAttributes(attributes) : {}

    if (!this._globalAttributes || Object.keys(this._globalAttributes).length === 0) {
      return sanitized
    }

    return {
      ...this._globalAttributes,
      ...sanitized
    }
  }

  flushQueue () {
    if (!this._queue.length) {
      return
    }

    const queue = [...this._queue]
    this._queue.length = 0

    if (!this._client) {
      return
    }

    queue.forEach(callback => {
      try {
        callback(this._client)
      } catch (error) {
        logger.error('[TrackingService] Failed to flush queued tracking call', error)
      }
    })
  }

  // Returns the Faro-API-compatible shim. Callers that previously dug into
  // `getClient().api.pushEvent(...)` still work; the shim forwards to the
  // analyzing client. Set `getRawClient: true` (debug only) to get the raw
  // createAnalyzing handle.
  getClient (opts = {}) {
    if (opts && opts.getRawClient) return this._analyzing
    return this._client
  }

  // Force-flush any batched envelope to the network — useful before page
  // unload or in tests that want deterministic delivery.
  flush () {
    try {
      this._analyzing?.flush?.()
    } catch (error) {
      logger.warn('[TrackingService] flush failed:', error)
    }
  }

  isEnabled () {
    return this._enabled && Boolean(this._client)
  }

  isInitialized () {
    return this._initialized
  }

  destroy () {
    this._queue.length = 0

    if (this._client?.destroy) {
      try {
        this._client.destroy()
      } catch (error) {
        logger.warn('[TrackingService] Failed to destroy analyzing client cleanly', error)
      }
    }

    if (isBrowserEnvironment() && window.symbols && window.symbols.tracking === this._client) {
      delete window.symbols.tracking
    }

    this._client = null
    this._analyzing = null
    this._initialized = false
    this._setupPromise = null
    this._setReady(false)
    this._enabled = this._trackingOptions.enabled !== false
  }

  _buildRuntimeConfig () {
    const contextConfig = this._context?.tracking || {}
    const merged = {
      ...DEFAULT_TRACKING_OPTIONS,
      ...this._trackingOptions,
      ...contextConfig
    }

    const appName =
      merged.appName ||
      contextConfig.appName ||
      this._trackingOptions.appName ||
      environment.grafanaAppName ||
      'workspace'

    const appVersion =
      merged.appVersion ||
      contextConfig.appVersion ||
      this._trackingOptions.appVersion ||
      this._context?.appVersion ||
      null

    const environmentName =
      merged.environment ||
      contextConfig.environment ||
      this._trackingOptions.environment ||
      this._resolveEnvironmentName()

    const contextGlobalAttributes = sanitizeAttributes(contextConfig.globalAttributes || {})
    const globalAttributes = sanitizeAttributes({
      ...this._globalAttributes,
      ...contextGlobalAttributes
    })

    return {
      appName,
      appVersion,
      environment: environmentName,
      globalAttributes,
      sessionTracking: merged.sessionTracking !== false,
      enableTracing: merged.enableTracing !== false,
      transport: typeof merged.transport === 'function' ? merged.transport : null,
      user: merged.user,
      maxQueueSize:
        typeof merged.maxQueueSize === 'number' && merged.maxQueueSize > 0
          ? merged.maxQueueSize
          : DEFAULT_MAX_QUEUE_SIZE
    }
  }

  _resolveEnvironmentName () {
    if (environment.isProduction) return 'production'
    if (environment.isStaging) return 'staging'
    if (environment.isTesting) return 'testing'
    if (environment.isDevelopment) return 'development'
    return process.env.NODE_ENV || 'development'
  }

  // Resolves a transport function on demand. Callers can override the SDK
  // route by passing their own `tracking.transport` in options; otherwise
  // the envelope flows through the same workspace-project worker every
  // other workspace SDK call uses.
  _resolveTransport (runtimeConfig) {
    if (typeof runtimeConfig.transport === 'function') return runtimeConfig.transport
    return async (envelope) => {
      try {
        const wp = this._context?.services?.workspaceProject
        if (!wp?.analyzed?.ingest) return { ok: false }
        const res = await wp.analyzed.ingest(envelope)
        return { ok: !res?.error }
      } catch (error) {
        logger.warn('[TrackingService] transport failed:', error?.message || error)
        return { ok: false }
      }
    }
  }

  async _setupAnalyzingClient (runtimeConfig) {
    try {
      const transport = this._resolveTransport(runtimeConfig)

      this._analyzing = createAnalyzing({
        appKey: runtimeConfig.appName,
        release: runtimeConfig.appVersion || null,
        env: runtimeConfig.environment,
        transport,
        level: 'info',
        sampleRate: 1,
        consoleSink: false,
        memorySink: true
      })

      // Seed the analyzing context with any global attributes the caller
      // configured pre-init.
      for (const [k, v] of Object.entries(runtimeConfig.globalAttributes || {})) {
        try { this._analyzing.setContext(k, v) } catch (_) {}
      }

      // The plugin state activates from inside DOMQL's create() chain; here
      // (outside DOMQL) we activate explicitly so manual captures don't sit
      // in the pre-ready buffer indefinitely.
      try { this._analyzing.state.activate(null) } catch (_) {}

      this._client = buildAnalyzingShim(this._analyzing)

      if (runtimeConfig.user) {
        this.setUser(runtimeConfig.user, { queue: false })
      }

      if (isBrowserEnvironment()) {
        window.symbols ||= {}
        window.symbols.tracking = this._client
      }

      this._initialized = true
      this._setReady()
      this.flushQueue()
    } catch (error) {
      this._enabled = false
      this._setError(error)
      this._ready = true
      logger.error('[TrackingService] Failed to initialize analyzing client:', error)
    } finally {
      this._setupPromise = null
    }
  }

  _withClient (callback, options = {}) {
    if (!this._enabled) {
      return null
    }

    if (this._client) {
      try {
        return callback(this._client)
      } catch (error) {
        logger.error('[TrackingService] Tracking callback failed:', error)
        return null
      }
    }

    if (options.queue === false) {
      return null
    }

    const queueLimit =
      this._runtimeConfig.maxQueueSize ??
      this._trackingOptions.maxQueueSize ??
      DEFAULT_MAX_QUEUE_SIZE

    if (this._queue.length >= queueLimit) {
      this._queue.shift()
    }

    this._queue.push(callback)

    return null
  }
}
