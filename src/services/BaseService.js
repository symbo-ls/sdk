import environment from '../config/environment.js'
import { getTokenManager } from '../utils/TokenManager.js'
import { logger } from '../utils/logger.js'

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
        throw new Error(error.message || error.error || 'Request failed', { cause: error })
      }

      return response.status === 204 ? null : response.json()
    } catch (error) {
      // Track network/other request errors before rethrowing
      this._trackServiceError(error, {
        endpoint,
        methodName: options.methodName
      })
      throw new Error(`Request failed: ${error.message}`, { cause: error })
    }
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
      'getPublicProject'
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
