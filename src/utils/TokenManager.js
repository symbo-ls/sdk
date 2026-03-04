/**
 * TokenManager - Handles access and refresh token management
 * Provides persistence, automatic refresh, and token lifecycle management
 */
export class TokenManager {
  constructor (options = {}) {
    this.config = {
      storagePrefix: 'symbols_',
      storageType: (typeof window === 'undefined' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'testing') ? 'memory' : 'localStorage', // 'localStorage' | 'sessionStorage' | 'memory'
      refreshBuffer: 60 * 1000, // Refresh 1 minute before expiry
      maxRetries: 3,
      apiUrl: options.apiUrl || '/api',
      onTokenRefresh: options.onTokenRefresh || null,
      onTokenExpired: options.onTokenExpired || null,
      onTokenError: options.onTokenError || null,
      ...options
    }

    this.tokens = {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      expiresIn: null
    }

    this.refreshPromise = null
    this.refreshTimeout = null
    this.retryCount = 0

    // Load tokens from storage on initialization
    this.loadTokens()
  }

  /**
   * Storage keys
   */
  get storageKeys () {
    return {
      accessToken: `${this.config.storagePrefix}access_token`,
      refreshToken: `${this.config.storagePrefix}refresh_token`,
      expiresAt: `${this.config.storagePrefix}expires_at`,
      expiresIn: `${this.config.storagePrefix}expires_in`
    }
  }

  /**
   * Get storage instance based on configuration
   */
  get storage () {
    if (typeof window === 'undefined') {
      // Node.js environment - use memory storage
      return this._memoryStorage
    }

    // Guard against environments where accessing storage throws (e.g., opaque origins)
    const safeGetStorage = (provider) => {
      try {
        const storage = provider()
        // Try a simple set/remove cycle to ensure it is usable
        const testKey = `${this.config.storagePrefix}__tm_test__`
        storage.setItem(testKey, '1')
        storage.removeItem(testKey)
        return storage
      } catch {
        return null
      }
    }

    const localStorageInstance = safeGetStorage(() => window.localStorage)
    const sessionStorageInstance = safeGetStorage(() => window.sessionStorage)

    switch (this.config.storageType) {
      case 'sessionStorage':
        return sessionStorageInstance || this._memoryStorage
      case 'memory':
        return this._memoryStorage
      default:
        return localStorageInstance || this._memoryStorage
    }
  }

  /**
   * Memory storage fallback for server-side rendering
   */
  _memoryStorage = {
    _data: {},
    getItem: (key) => this._memoryStorage._data[key] || null,
    setItem: (key, value) => { this._memoryStorage._data[key] = value },
    removeItem: (key) => { delete this._memoryStorage._data[key] },
    clear: () => { this._memoryStorage._data = {} }
  }

  /**
   * Set tokens and persist to storage
   */
  setTokens (tokenData) {
    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      token_type: tokenType = 'Bearer'
    } = tokenData

    if (!accessToken) {
      throw new Error('Access token is required')
    }

    // Calculate expiry time
    const now = Date.now()
    const expiresAt = expiresIn ? now + (expiresIn * 1000) : null

    // Update internal state
    this.tokens = {
      accessToken,
      refreshToken: refreshToken || this.tokens.refreshToken,
      expiresAt,
      expiresIn,
      tokenType
    }

    // Persist to storage
    this.saveTokens()

    // Schedule automatic refresh
    this.scheduleRefresh()

    // Trigger callback
    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(this.tokens)
    }

    return this.tokens
  }

  /**
   * Get current access token
   */
  getAccessToken () {
    return this.tokens.accessToken
  }

  /**
   * Get current refresh token
   */
  getRefreshToken () {
    return this.tokens.refreshToken
  }

  /**
   * Get authorization header value
   */
  getAuthHeader () {
    const token = this.getAccessToken()
    if (!token) {return null}

    return `${this.tokens.tokenType || 'Bearer'} ${token}`
  }

  /**
   * Check if access token is valid and not expired
   */
  isAccessTokenValid () {
    if (!this.tokens.accessToken) {return false}
    if (!this.tokens.expiresAt) {return true} // No expiry info, assume valid

    const now = Date.now()
    const isValid = now < (this.tokens.expiresAt - this.config.refreshBuffer)

    if (!isValid) {
      console.log('[TokenManager] Access token is expired or near expiry:', {
        now: new Date(now).toISOString(),
        expiresAt: new Date(this.tokens.expiresAt).toISOString(),
        refreshBuffer: this.config.refreshBuffer
      })
    }

    return isValid
  }

  /**
   * Check if access token exists and is not expired (without refresh buffer)
   */
  isAccessTokenActuallyValid () {
    if (!this.tokens.accessToken) {return false}
    if (!this.tokens.expiresAt) {return true} // No expiry info, assume valid

    const now = Date.now()
    return now < this.tokens.expiresAt
  }

  /**
   * Check if tokens exist (regardless of expiry)
   */
  hasTokens () {
    return Boolean(this.tokens.accessToken)
  }

  /**
   * Check if refresh token exists
   */
  hasRefreshToken () {
    return Boolean(this.tokens.refreshToken)
  }

  /**
   * Automatically refresh tokens if needed
   */
  async ensureValidToken () {
    // If no tokens, return null
    if (!this.hasTokens()) {
      return null
    }

    // If token is still valid, return it
    if (this.isAccessTokenValid()) {
      return this.getAccessToken()
    }

    // If no refresh token, clear tokens and return null
    if (!this.hasRefreshToken()) {
      this.clearTokens()
      if (this.config.onTokenExpired) {
        this.config.onTokenExpired()
      }
      return null
    }

    // Attempt to refresh token
    try {
      await this.refreshTokens()
      return this.getAccessToken()
    } catch (error) {
      this.clearTokens()
      if (this.config.onTokenError) {
        this.config.onTokenError(error)
      }
      throw error
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens () {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    if (!this.hasRefreshToken()) {
      throw new Error('No refresh token available')
    }

    if (this.retryCount >= this.config.maxRetries) {
      throw new Error('Max refresh retries exceeded')
    }

    this.refreshPromise = this._performRefresh()

    try {
      const result = await this.refreshPromise
      this.retryCount = 0 // Reset retry count on success
      return result
    } catch (error) {
      this.retryCount++
      throw error
    } finally {
      this.refreshPromise = null
    }
  }

  /**
   * Perform the actual token refresh request
   */
  async _performRefresh () {
    const refreshToken = this.getRefreshToken()

    const response = await fetch(`${this.config.apiUrl}/core/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Token refresh failed: ${response.status}`)
    }

    const responseData = await response.json()

    // Handle new response format: responseData.data.tokens
    if (responseData.success && responseData.data && responseData.data.tokens) {
      const { tokens } = responseData.data
      const tokenData = {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.accessTokenExp?.expiresIn,
        token_type: 'Bearer'
      }
      return this.setTokens(tokenData)
    }
      // Fallback to old format for backward compatibility
      return this.setTokens(responseData)

  }

  /**
   * Schedule automatic token refresh
   */
  scheduleRefresh () {
    // Clear existing timeout
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }

    // Don't schedule if no expiry info or no refresh token
    if (!this.tokens.expiresAt || !this.hasRefreshToken()) {
      return
    }

    const now = Date.now()
    const refreshTime = this.tokens.expiresAt - this.config.refreshBuffer
    const delay = Math.max(0, refreshTime - now)

    this.refreshTimeout = setTimeout(async () => {
      try {
        await this.refreshTokens()
      } catch (error) {
        console.error('Automatic token refresh failed:', error)
        if (this.config.onTokenError) {
          this.config.onTokenError(error)
        }
      }
    }, delay)
  }

  /**
   * Save tokens to storage
   */
  saveTokens () {
    try {
      const {storage} = this
      const keys = this.storageKeys

      if (this.tokens.accessToken) {
        storage.setItem(keys.accessToken, this.tokens.accessToken)
      }

      if (this.tokens.refreshToken) {
        storage.setItem(keys.refreshToken, this.tokens.refreshToken)
      }

      if (this.tokens.expiresAt) {
        storage.setItem(keys.expiresAt, this.tokens.expiresAt.toString())
      }

      if (this.tokens.expiresIn) {
        storage.setItem(keys.expiresIn, this.tokens.expiresIn.toString())
      }

    } catch (error) {
      console.error('[TokenManager] Error saving tokens to storage:', error)
      // Don't throw here as it would break the token setting flow
      // but log the error for debugging
    }
  }

  /**
   * Load tokens from storage
   */
  loadTokens () {
    try {
      const {storage} = this
      const keys = this.storageKeys

      const accessToken = storage.getItem(keys.accessToken)
      const refreshToken = storage.getItem(keys.refreshToken)
      const expiresAt = storage.getItem(keys.expiresAt)
      const expiresIn = storage.getItem(keys.expiresIn)

      if (accessToken) {
        this.tokens = {
          accessToken,
          refreshToken,
          expiresAt: expiresAt ? parseInt(expiresAt, 10) : null,
          expiresIn: expiresIn ? parseInt(expiresIn, 10) : null,
          tokenType: 'Bearer'
        }

        // Schedule refresh for loaded tokens
        this.scheduleRefresh()
      }
    } catch (error) {
      console.error('[TokenManager] Error loading tokens from storage:', error)
      this.tokens = {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        expiresIn: null
      }
    }
  }

  /**
   * Clear all tokens
   */
  clearTokens () {
    // Clear memory
    this.tokens = {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      expiresIn: null
    }

    // Clear storage
    const {storage} = this
    const keys = this.storageKeys

    Object.values(keys).forEach(key => {
      storage.removeItem(key)
    })

    // Clear scheduled refresh
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }

    // Reset retry count
    this.retryCount = 0
  }

  /**
   * Get token status information
   */
  getTokenStatus () {
    const hasTokens = this.hasTokens()
    const isValid = this.isAccessTokenValid()
    const {expiresAt} = this.tokens
    const timeToExpiry = expiresAt ? expiresAt - Date.now() : null

    return {
      hasTokens,
      isValid,
      hasRefreshToken: this.hasRefreshToken(),
      expiresAt,
      timeToExpiry,
      willExpireSoon: timeToExpiry ? timeToExpiry < this.config.refreshBuffer : false
    }
  }

  /**
   * Cleanup resources
   */
  destroy () {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }

    this.refreshPromise = null
  }
}

// Export singleton instance
let defaultTokenManager = null

export const getTokenManager = (options) => {
  if (!defaultTokenManager) {
    defaultTokenManager = new TokenManager(options)
  }
  return defaultTokenManager
}

export const createTokenManager = (options) => new TokenManager(options)