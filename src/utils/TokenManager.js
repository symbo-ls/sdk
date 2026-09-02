import { logger } from './logger.js'

// A refresh that never REACHED the server says nothing about whether the
// session is still valid — it is a statement about the network, not about the
// credential. Distinguishing the two is essential: treating a transport blip as
// an auth rejection is what silently signed users out whenever the API bounced
// (a nodemon restart in dev, a rolling deploy in prod), which then surfaced
// downstream as "Couldn't switch to <org>" and as network errors in the AI chat.
// Mirrors BaseService's _isNetworkFailure so both layers classify identically.
const _NETWORK_RX = /failed to fetch|networkerror|load failed|network request failed/i
export const isNetworkFailure = (err) =>
  !!err &&
  (err.code === 'NETWORK_UNREACHABLE' ||
    (err instanceof TypeError && _NETWORK_RX.test(err.message || '')) ||
    (err.name === 'TypeError' && _NETWORK_RX.test(err.message || '')))

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

    // The PER-TAB persona overlay (see the block comment on setPersonaToken).
    // Held separately from `this.tokens` so the admin's real session is never
    // overwritten, only shadowed.
    this._personaToken = null

    // Load tokens from storage on initialization
    this.loadTokens()
    this.loadPersonaToken()
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
   * Storage key for the per-tab persona overlay. Deliberately NOT one of
   * `storageKeys` — nothing that walks that map may touch the overlay.
   */
  get personaStorageKey () {
    return `${this.config.storagePrefix}persona_access_token`
  }

  /**
   * The overlay's storage is ALWAYS sessionStorage when one exists, whatever
   * `config.storageType` says. That is the whole isolation guarantee, and it
   * must not be configurable away: sessionStorage is per-tab by construction,
   * so a persona started in one tab cannot reach the admin's other tabs.
   *
   * Falls back to the in-memory store (SSR, Node, opaque origins, storage
   * disabled) — where "per tab" is trivially satisfied by "per process".
   */
  get _tabStorage () {
    if (typeof window === 'undefined') return this._memoryStorage
    try {
      const storage = window.sessionStorage
      const testKey = `${this.config.storagePrefix}__tm_persona_test__`
      storage.setItem(testKey, '1')
      storage.removeItem(testKey)
      return storage
    } catch {
      return this._memoryStorage
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
   * Get current access token — the persona overlay when one is active in
   * THIS tab, otherwise the admin's own token.
   *
   * Every outbound call resolves its credential through here (getAuthHeader
   * → getAccessToken), so overlaying at this single point is what makes a
   * persona cover the whole SDK surface rather than one route family.
   */
  getAccessToken () {
    return this._personaToken || this.tokens.accessToken
  }

  /**
   * Install a persona token over this tab's session.
   *
   * ── Why an overlay instead of setTokens() ──────────────────────────────
   * `setTokens()` writes `symbols_access_token` in localStorage — the admin's
   * OWN session key, shared by every tab on the origin. Adopting a persona
   * that way silently downgrades the admin's other tabs to the persona's
   * permissions, and the only way back is a token refresh that can fail.
   * The overlay instead SHADOWS the base token, per tab:
   *   - the admin's localStorage session is never written and never lost;
   *   - other tabs keep reading their own base token and stay admin;
   *   - exiting is a delete (clearPersonaToken), not a recovery operation
   *     that can leave the lens stuck on when the network is down.
   *
   * The overlay is STICKY until explicitly cleared — including when the
   * persona token expires. Silently falling back to the base token would
   * restore full admin power underneath a UI still showing the persona,
   * which is the exact "confident wrong answer" this feature exists to
   * prevent; an expired persona must 401 honestly instead.
   *
   * @param {string} token persona-claimed JWT from POST /core/persona/start
   * @returns {boolean} whether the overlay is now installed
   */
  setPersonaToken (token) {
    if (typeof token !== 'string' || !token) {
      logger.warn('[TokenManager] refusing to install an empty persona token')
      return false
    }
    this._personaToken = token
    try {
      this._tabStorage.setItem(this.personaStorageKey, token)
    } catch (error) {
      // In-memory overlay still holds for this page's lifetime; it just will
      // not survive a reload. Say so rather than reporting success.
      logger.warn('[TokenManager] persona overlay not persisted to sessionStorage:', error)
    }
    return true
  }

  /**
   * The active persona token for this tab, or null.
   */
  getPersonaToken () {
    return this._personaToken
  }

  /**
   * Whether this tab is currently viewing through a persona.
   */
  hasPersonaToken () {
    return !!this._personaToken
  }

  /**
   * Remove the overlay — the admin's own token becomes current again with no
   * refresh, no network call, and no chance of being left half-applied.
   */
  clearPersonaToken () {
    this._personaToken = null
    try {
      this._tabStorage.removeItem(this.personaStorageKey)
    } catch {
      /* locked storage — the in-memory overlay is already gone */
    }
  }

  /**
   * Restore this tab's overlay at boot. sessionStorage survives a reload of
   * its own tab, so a persona stays in force across F5 — matching the
   * server-side session, which outlives the page.
   */
  loadPersonaToken () {
    try {
      const stored = this._tabStorage.getItem(this.personaStorageKey)
      this._personaToken = typeof stored === 'string' && stored ? stored : null
    } catch {
      this._personaToken = null
    }
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
   * Decode `exp` (seconds since epoch) from a JWT access token without
   * verifying the signature. Returns null when the token is not a JWT or
   * the payload can't be parsed. Used as a fallback when `expiresAt` was
   * never persisted alongside the token — e.g. an external auth flow
   * dropped `symbols_access_token` into localStorage directly, or a stale
   * session lingers from a previous build.
   */
  _decodeJwtExpMs () {
    const token = this.tokens.accessToken
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      while (payload.length % 4) payload += '='
      const json = typeof atob === 'function'
        ? atob(payload)
        : Buffer.from(payload, 'base64').toString('utf8')
      const claims = JSON.parse(json)
      const exp = typeof claims?.exp === 'number' ? claims.exp : null
      return exp != null ? exp * 1000 : null
    } catch {
      return null
    }
  }

  /**
   * Resolve the effective access-token expiry in ms. Prefers the stored
   * `expiresAt` (set via setTokens from `expires_in`); falls back to the
   * JWT `exp` claim when stored expiry is missing. Returns null when no
   * expiry info is available from either source.
   */
  _resolveAccessTokenExpiryMs () {
    if (this.tokens.expiresAt) return this.tokens.expiresAt
    return this._decodeJwtExpMs()
  }

  /**
   * Check if access token is valid and not expired
   */
  isAccessTokenValid () {
    if (!this.tokens.accessToken) {return false}
    const expiresAt = this._resolveAccessTokenExpiryMs()
    if (!expiresAt) {return true} // No expiry info anywhere, assume valid

    const now = Date.now()
    const isValid = now < (expiresAt - this.config.refreshBuffer)

    if (!isValid) {
      logger.log('[TokenManager] Access token is expired or near expiry:', {
        now: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
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
    const expiresAt = this._resolveAccessTokenExpiryMs()
    if (!expiresAt) {return true} // No expiry info anywhere, assume valid

    const now = Date.now()
    return now < expiresAt
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
      // A refresh that never reached the server is NOT proof the session ended.
      // Clearing here on a transport failure is what signed users out every time
      // the API bounced: the dev server restarts under nodemon, this refresh
      // fires mid-restart, `fetch` throws `TypeError: Failed to fetch`, and the
      // whole session was destroyed — surfacing downstream as "Couldn't switch
      // to <org>" and as network errors in the AI chat. Keep the credentials and
      // rethrow so the caller can retry once the API is reachable again.
      if (isNetworkFailure(error)) {
        logger.warn('[TokenManager] refresh unreachable — keeping session for retry')
        throw error
      }
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
      // Only a genuine rejection counts toward the lockout. Counting transport
      // failures meant three API restarts permanently tripped 'Max refresh
      // retries exceeded' for the rest of the session, with no way back short
      // of a full re-login.
      if (!isNetworkFailure(error)) this.retryCount++
      throw error
    } finally {
      this.refreshPromise = null
    }
  }

  /**
   * Perform the actual token refresh request.
   *
   * CROSS-TAB ROTATION (2026-09-02 — the /login?next renderer-OOM loop):
   * refresh tokens are SINGLE-USE. Two tabs of one origin each hold a copy;
   * whichever rotates first invalidates the other's. The loser used to send
   * its stale copy, read the server's refusal as "session dead", clear the
   * SHARED storage (killing the winner's persisted session too) and bounce
   * to /login — where the winner's re-written tokens forwarded it straight
   * back: the ping-pong that OOM-crashed the renderer (four Crashpad dumps,
   * 2026-09-01/02; workspace 3ade58b39 carries the guard-side breaker).
   * Three layers close the race itself:
   *   1. a Web-Locks mutex serializes rotation across the origin's tabs;
   *   2. after acquiring the lock, storage is re-read — a rotation that
   *      happened while waiting ends this refresh with ZERO network;
   *   3. if the server still refuses AND storage now holds a DIFFERENT
   *      refresh token than the one sent, the race was lost mid-flight:
   *      adopt the winner's tokens and retry once instead of clearing a
   *      healthy session.
   * Node/tests (no navigator.locks) keep the direct path; the persona
   * overlay lives in `_personaToken`, never in `this.tokens`, so base-token
   * adoption cannot disturb it.
   */
  async _performRefresh () {
    const run = () => this._performRefreshExclusive()
    const hasLocks = typeof navigator !== 'undefined' &&
      navigator.locks && typeof navigator.locks.request === 'function'
    return hasLocks
      ? navigator.locks.request('symbols_token_rotation', run)
      : run()
  }

  async _performRefreshExclusive () {
    // Layer 2 — another tab may have rotated while we waited on the lock.
    if (this._adoptStoredTokens() && this.isAccessTokenValid()) {
      return this.tokens
    }
    const sent = this.getRefreshToken()
    try {
      return await this._rotateWith(sent)
    } catch (error) {
      // Layer 3 — refute-then-recheck. A transport failure says nothing
      // about the token, so it keeps the existing keep-and-rethrow path.
      if (isNetworkFailure(error)) throw error
      const changed = this._adoptStoredTokens()
      const current = this.getRefreshToken()
      if (changed && current && current !== sent) {
        logger.warn('[TokenManager] refresh lost a cross-tab rotation race — adopting the winner\'s tokens')
        if (this.isAccessTokenValid()) return this.tokens
        return this._rotateWith(current)
      }
      throw error
    }
  }

  async _rotateWith (refreshToken) {
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
   * Re-read the base tokens from the shared storage and adopt any values
   * another tab wrote since our last read. Returns true when memory changed.
   * Memory-mode storage is process-local (the same object this instance
   * writes), so this is a no-op there by construction and tests stay
   * deterministic. Never touches the per-tab persona overlay.
   */
  _adoptStoredTokens () {
    try {
      const { storage } = this
      const keys = this.storageKeys
      const accessToken = storage.getItem(keys.accessToken)
      const refreshToken = storage.getItem(keys.refreshToken)
      if (!accessToken && !refreshToken) return false
      const changed = accessToken !== this.tokens.accessToken ||
        refreshToken !== this.tokens.refreshToken
      if (!changed) return false
      const expiresAt = storage.getItem(keys.expiresAt)
      const expiresIn = storage.getItem(keys.expiresIn)
      this.tokens = {
        accessToken,
        refreshToken,
        expiresAt: expiresAt ? parseInt(expiresAt, 10) : null,
        expiresIn: expiresIn ? parseInt(expiresIn, 10) : null,
        tokenType: 'Bearer'
      }
      this.scheduleRefresh()
      return true
    } catch (_) {
      return false
    }
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
        logger.error('Automatic token refresh failed:', error)
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
      logger.error('[TokenManager] Error saving tokens to storage:', error)
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
      logger.error('[TokenManager] Error loading tokens from storage:', error)
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

    // A sign-out drops the persona with the session it was layered over —
    // leaving the overlay behind would present a persona token as the only
    // credential of a signed-out tab.
    this.clearPersonaToken()

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
   * Get token status information.
   *
   * The `status` field is the high-level summary the workspace shell uses
   * to decide between "render data" / "render expired-banner" / "render
   * sign-in form". Three states:
   *  - `'missing'`  — no access token at all
   *  - `'expired'`  — token exists but JWT `exp` is in the past AND no
   *                   refresh token is available to recover
   *  - `'valid'`    — token exists and isAccessTokenValid() agrees
   *                   (covers "refresh-token present, will auto-rotate"
   *                   as well as "long-lived token still in window")
   */
  getTokenStatus () {
    const hasTokens = this.hasTokens()
    const isValid = this.isAccessTokenValid()
    const expiresAt = this._resolveAccessTokenExpiryMs()
    const timeToExpiry = expiresAt ? expiresAt - Date.now() : null
    let status = 'missing'
    if (hasTokens) {
      if (isValid) {
        status = 'valid'
      } else if (this.hasRefreshToken()) {
        // Expired but recoverable — treat as valid for UI purposes; the
        // next request will trigger refreshTokens() automatically.
        status = 'valid'
      } else {
        status = 'expired'
      }
    }

    return {
      status,
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

// The DEFAULT TokenManager is parked on globalThis, not held in a
// module-scoped `let`.
//
// One realm routinely evaluates this module more than once — a bundled sdk
// copy (smbls' framework registry) plus the host app's own `@symbo.ls/sdk`
// import is the everyday case in canvas, preview and the workspace shell. A
// module-scoped singleton gives each copy its OWN TokenManager over ONE
// localStorage session: both load the same refresh token at construction, the
// first to rotate spends it, the second then presents a token the server has
// already retired, and the user is signed out with nothing thrown and nothing
// logged. `state/rootEventBus.js` parks its singleton the same way, for the
// same reason.
//
// `createTokenManager()` below is unaffected — it stays per-call by design.
const GLOBAL_TOKEN_MANAGER_KEY = '__SMBLS_TOKEN_MANAGER__'

export const getTokenManager = (options) => {
  if (!globalThis[GLOBAL_TOKEN_MANAGER_KEY]) {
    globalThis[GLOBAL_TOKEN_MANAGER_KEY] = new TokenManager(options)
  }
  return globalThis[GLOBAL_TOKEN_MANAGER_KEY]
}

export const createTokenManager = (options) => new TokenManager(options)