export class BaseService {
  constructor ({ context, options } = {}) {
    this._context = context || {}
    this._options = options || {}
    this._ready = false
    this._error = null
  }

  // Initialize service

  init () {
    throw new Error('init() must be implemented by service')
  }

  // Update context
  updateContext (context) {
    this._context = { ...this._context, ...context }
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

  _requireAuth () {
    if (!this._context.authToken) {
      throw new Error('Authentication required')
    }
  }

  _requireReady () {
    if (!this.isReady()) {
      throw new Error('Service not initialized')
    }
  }
}
