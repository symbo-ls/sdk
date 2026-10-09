/**
 * ScopedTokenHolder — the token store of an SDK built with
 * `new SDK({ previewReadToken })` (PREVIEW-READ-TOKEN).
 *
 * A preview host runs USER project code. The page may hold ONE short-lived
 * preview-read token (one project, read only, <= 10 min, minted by
 * `POST /core/auth/preview-token`) and nothing else. This holder is what
 * makes that true on the client side:
 *
 *   - It is per SDK instance. It is never parked on `globalThis` (the default
 *     TokenManager lives on `globalThis.__SMBLS_TOKEN_MANAGER__`, where any
 *     script in the page can read it), and building an SDK in this mode never
 *     creates that global at all.
 *   - It never reads or writes localStorage, sessionStorage or cookies.
 *   - It never refreshes. There is no refresh token; an expired token simply
 *     stops being sent, and the preview mints a new one through the shell.
 *   - It refuses `setTokens` and persona tokens, so a `login()` (or any
 *     other code path) cannot install a platform session into a preview SDK.
 *
 * It implements the TokenManager surface the services call, so every
 * service works unchanged.
 */
const decodeExpMs = (token) => {
  try {
    const part = String(token).split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8')
    const exp = JSON.parse(json)?.exp
    return Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

export class ScopedTokenHolder {
  constructor (token) {
    const value = typeof token === 'string' && token ? token : null
    // Closure-held, not an own enumerable property: a JSON dump or a spread
    // of the holder carries no token.
    let current = value
    let expMs = value ? decodeExpMs(value) : null
    this._read = () => current
    this._expMs = () => expMs
    this._clear = () => {
      current = null
      expMs = null
    }
    Object.defineProperty(this, 'isScopedTokenHolder', { value: true })
  }

  getAccessToken () {
    const t = this._read()
    if (!t) return null
    const exp = this._expMs()
    if (exp && exp <= Date.now()) return null
    return t
  }

  getAuthHeader () {
    const t = this.getAccessToken()
    return t ? `Bearer ${t}` : null
  }

  async ensureValidToken () {
    return this.getAccessToken()
  }

  isAccessTokenValid () {
    return !!this.getAccessToken()
  }

  isAccessTokenActuallyValid () {
    return this.isAccessTokenValid()
  }

  hasTokens () {
    return !!this.getAccessToken()
  }

  hasRefreshToken () {
    return false
  }

  getRefreshToken () {
    return null
  }

  async refreshTokens () {
    return null
  }

  setTokens () {
    // A preview SDK carries exactly the token it was built with.
    return null
  }

  setPersonaToken () {}
  getPersonaToken () {
    return null
  }

  hasPersonaToken () {
    return false
  }

  clearPersonaToken () {}
  invalidateClaims () {}
  scheduleRefresh () {}
  saveTokens () {}
  loadTokens () {}

  clearTokens () {
    this._clear()
  }

  destroy () {
    this._clear()
  }

  getTokenStatus () {
    const hasTokens = this.hasTokens()
    const expiresAt = this._expMs()
    const timeToExpiry = expiresAt ? expiresAt - Date.now() : null
    return {
      status: hasTokens ? 'valid' : (this._read() ? 'expired' : 'missing'),
      hasTokens,
      isValid: hasTokens,
      hasRefreshToken: false,
      expiresAt,
      timeToExpiry,
      willExpireSoon: false
    }
  }
}

export const createScopedTokenHolder = (token) => new ScopedTokenHolder(token)
