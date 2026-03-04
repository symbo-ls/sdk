import { BaseService } from './BaseService.js'
import environment from '../config/environment.js'

const DEFAULT_MAX_QUEUE_SIZE = 100

const isBrowserEnvironment = () => typeof window !== 'undefined'

const DEFAULT_TRACKING_OPTIONS = {
  // Enabled by default unless explicitly disabled via SDK options or runtime config
  enabled: true,
  sessionTracking: true,
  enableTracing: true,
  maxQueueSize: DEFAULT_MAX_QUEUE_SIZE,
  transports: null,
  instrumentations: null,
  instrumentationsFactory: null,
  webInstrumentationOptions: null,
  globalAttributes: {},
  transport: null,
  user: null
}

const sanitizeAttributes = (value) => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    console.warn('[TrackingService] Failed to sanitize attributes:', error)
    return { ...value }
  }
}

export class TrackingService extends BaseService {
  constructor ({ context, options } = {}) {
    super({ context, options })

    this._faroClient = null
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

    // Merge tracking options from constructor, SDK options and runtime overrides
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
    this._trackingOptions.transports = this._runtimeConfig.transports

    const hasCustomTransports =
      Array.isArray(this._runtimeConfig.transports) &&
      this._runtimeConfig.transports.length > 0

    if (!this._runtimeConfig.url && !hasCustomTransports) {
      console.warn('[TrackingService] Grafana Faro URL missing. Tracking will stay disabled.')
      this._enabled = false
      this._setReady()
      return this
    }

    if (this._initialized) {
      this._setReady()
      return this
    }

    if (!this._setupPromise) {
      this._setupPromise = this._loadFaroClient(this._runtimeConfig)
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
    const eventDomain = Object.hasOwn(eventOptions, 'domain')
      ? domain
      : null

    const invokeTracking = client => {
      const api = client?.api
      if (!api?.pushEvent) {
        console.warn('[TrackingService] Faro pushEvent API not available')
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

    const normalizedOptions = isContextOnly
      ? { context: options }
      : options || {}

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
        console.warn('[TrackingService] Faro pushError API not available')
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
        console.warn('[TrackingService] Faro pushLog API not available')
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
        console.warn('[TrackingService] Faro pushMeasurement API not available')
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
        console.warn('[TrackingService] Faro setView API not available')
        return
      }

      api.setView({
        name,
        ...merged
      })
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
        console.warn('[TrackingService] Faro setUser API not available')
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
        console.warn('[TrackingService] Faro setUser API not available')
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
        console.warn('[TrackingService] Faro setSession API not available')
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
        console.warn('[TrackingService] Faro setSession API not available')
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

    if (!this._faroClient) {
      return
    }

    queue.forEach(callback => {
      try {
        callback(this._faroClient)
      } catch (error) {
        console.error('[TrackingService] Failed to flush queued tracking call', error)
      }
    })
  }

  getClient () {
    return this._faroClient
  }

  isEnabled () {
    return this._enabled && Boolean(this._faroClient)
  }

  isInitialized () {
    return this._initialized
  }

  destroy () {
    this._queue.length = 0

    if (this._faroClient?.destroy) {
      try {
        this._faroClient.destroy()
      } catch (error) {
        console.warn('[TrackingService] Failed to destroy Faro client cleanly', error)
      }
    }

    if (isBrowserEnvironment() && window.symbols && window.symbols.faro === this._faroClient) {
      delete window.symbols.faro
    }

    this._faroClient = null
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

    const transportList = []

    if (Array.isArray(merged.transports)) {
      transportList.push(...merged.transports.filter(Boolean))
    } else if (merged.transport) {
      transportList.push(merged.transport)
    }

    const configuredUrl =
      merged.url ||
      contextConfig.url ||
      this._trackingOptions.url

    let url = configuredUrl

    if (!url && transportList.length === 0) {
      url = environment.grafanaUrl
    }

    const appName =
      merged.appName ||
      contextConfig.appName ||
      this._trackingOptions.appName ||
      environment.grafanaAppName ||
      'Symbols Platform'

    const appVersion =
      merged.appVersion ||
      contextConfig.appVersion ||
      this._trackingOptions.appVersion ||
      this._context?.appVersion

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

    const runtimeConfig = {
      url,
      appName,
      appVersion,
      environment: environmentName,
      globalAttributes,
      sessionTracking: merged.sessionTracking !== false,
      enableTracing: merged.enableTracing !== false,
      user: merged.user,
      maxQueueSize:
        typeof merged.maxQueueSize === 'number' && merged.maxQueueSize > 0
          ? merged.maxQueueSize
          : DEFAULT_MAX_QUEUE_SIZE
    }

    if (typeof merged.isolate === 'boolean') {
      runtimeConfig.isolate = merged.isolate
    }

    if (Array.isArray(merged.instrumentations)) {
      runtimeConfig.instrumentations = merged.instrumentations
    }

    if (typeof merged.instrumentationsFactory === 'function') {
      runtimeConfig.instrumentationsFactory = merged.instrumentationsFactory
    }

    if (merged.webInstrumentationOptions != null) {
      runtimeConfig.webInstrumentationOptions = merged.webInstrumentationOptions
    }

    if (transportList.length > 0) {
      runtimeConfig.transports = transportList
    }

    return runtimeConfig
  }

  _resolveEnvironmentName () {
    if (environment.isProduction) {
      return 'production'
    }

    if (environment.isStaging) {
      return 'staging'
    }

    if (environment.isTesting) {
      return 'testing'
    }

    if (environment.isDevelopment) {
      return 'development'
    }

    return process.env.SYMBOLS_APP_ENV || process.env.NODE_ENV || 'development'
  }

  async _loadFaroClient (runtimeConfig) {
    try {
      const tracingImport = runtimeConfig.enableTracing === false
        ? Promise.resolve(null)
        : import('@grafana/faro-web-tracing').catch(error => {
            console.warn('[TrackingService] Tracing instrumentation failed to load:', error)
            return null
          })

      const [{ initializeFaro, getWebInstrumentations }, tracingModule] = await Promise.all([
        import('@grafana/faro-web-sdk'),
        tracingImport
      ])

      const TracingInstrumentation = tracingModule?.TracingInstrumentation

      const instrumentations = await this._resolveInstrumentations({
        runtimeConfig,
        getWebInstrumentations,
        TracingInstrumentation
      })

      const initializeOptions = {
        app: {
          name: runtimeConfig.appName,
          version: runtimeConfig.appVersion,
          environment: runtimeConfig.environment
        },
        instrumentations,
        globalAttributes: sanitizeAttributes(runtimeConfig.globalAttributes)
      }

      if (runtimeConfig.url) {
        initializeOptions.url = runtimeConfig.url
      }

      if (Array.isArray(runtimeConfig.transports) && runtimeConfig.transports.length > 0) {
        initializeOptions.transports = runtimeConfig.transports
      }

      if (runtimeConfig.sessionTracking === false) {
        initializeOptions.sessionTracking = false
      }

      if (runtimeConfig.isolate === true) {
        initializeOptions.isolate = true
      }

      this._faroClient = initializeFaro(initializeOptions)

      if (runtimeConfig.user) {
        this.setUser(runtimeConfig.user, { queue: false })
      }

      if (isBrowserEnvironment()) {
        window.symbols ||= {}
        window.symbols.faro = this._faroClient
      }

      this._initialized = true
      this._setReady()
      this.flushQueue()
    } catch (error) {
      this._enabled = false
      this._setError(error)
      this._ready = true
      console.error('[TrackingService] Failed to initialize Grafana Faro client:', error)
    } finally {
      this._setupPromise = null
    }
  }

  async _resolveInstrumentations ({
    runtimeConfig,
    getWebInstrumentations,
    TracingInstrumentation
  }) {
    if (Array.isArray(runtimeConfig.instrumentations)) {
      return runtimeConfig.instrumentations
    }

    if (typeof runtimeConfig.instrumentationsFactory === 'function') {
      try {
        const instrumentations = await runtimeConfig.instrumentationsFactory({
          runtimeConfig,
          getWebInstrumentations,
          TracingInstrumentation
        })

        if (Array.isArray(instrumentations)) {
          return instrumentations
        }
      } catch (error) {
        console.warn('[TrackingService] Custom instrumentation factory failed:', error)
      }
    }

    const instrumentationOptions =
      runtimeConfig.webInstrumentationOptions == null
        ? {}
        : runtimeConfig.webInstrumentationOptions

    const defaultInstrumentations = getWebInstrumentations(instrumentationOptions)

    if (runtimeConfig.enableTracing !== false && TracingInstrumentation) {
      try {
        defaultInstrumentations.push(new TracingInstrumentation())
      } catch (error) {
        console.warn('[TrackingService] Failed to instantiate tracing instrumentation:', error)
      }
    }

    return defaultInstrumentations
  }

  _withClient (callback, options = {}) {
    if (!this._enabled) {
      return null
    }

    if (this._faroClient) {
      try {
        return callback(this._faroClient)
      } catch (error) {
        console.error('[TrackingService] Tracking callback failed:', error)
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


