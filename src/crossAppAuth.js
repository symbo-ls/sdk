// Cross-app auth sync — share one signed-in session between the Symbols
// shell and canvas origins through the iframe `/_session-bridge` handshake
// (hydrateAuthFromIframeBridge). Each origin keeps its own session in its own
// storage.
//
// SESSION HARDENING (2026-10-08, P0): this module used to mirror the tokens
// into a `smbls_session` cookie on the parent domain (`.symbols.app`). Every
// subdomain can read such a cookie — including hosts that render user project
// code — and dev and prod shared the one cookie. The cookie path is gone:
// `hydrateAuthFromCookie`, `persistAuthToCookie` and `installAuthSync` keep
// their names (older callers still invoke them) but only DELETE an old copy of
// the cookie; nothing reads it and nothing writes a token into it
// (src/utils/tests/sessionHardening.test.js).

import { writeCookie } from './cookies.js'

export const DEFAULT_TOKEN_KEYS = [
  'symbols_access_token',
  'symbols_refresh_token',
  'symbols_expires_at',
  'symbols_expires_in',
  'symbols_bridge_access_token',
  'symbols_bridge_expires_at'
]

export function createCrossAppAuth({
  tokenKeys = DEFAULT_TOKEN_KEYS,
  sessionCookieName = 'smbls_session',
  resolvePeerOrigin = null, // optional fn → string|null
  bridgeIframePath = '/_session-bridge'
} = {}) {
  function collectLocalSession() {
    if (typeof localStorage === 'undefined') return null
    const out = {}
    let hasAny = false
    for (const k of tokenKeys) {
      const v = localStorage.getItem(k)
      if (v != null) {
        out[k] = v
        hasAny = true
      }
    }
    return hasAny ? out : null
  }

  function isFresh(session) {
    if (!session) return false
    const exp = Number(
      session.symbols_expires_at || session.symbols_bridge_expires_at || 0
    )
    if (!exp) return true
    return exp > Date.now()
  }

  function collectSdkTokens() {
    return collectLocalSession()
  }

  // Never reads the cookie. Deletes an old copy and reports "nothing hydrated".
  function hydrateAuthFromCookie() {
    clearAuthCookie()
    return false
  }

  // Never writes a token. Deletes an old copy of the cookie.
  function persistAuthToCookie() {
    clearAuthCookie()
  }

  function clearAuthCookie() {
    writeCookie(sessionCookieName, null, 0)
  }

  function hydrateAuthFromIframeBridge() {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(false)
        return
      }
      const local = collectLocalSession()
      if (isFresh(local)) {
        resolve(false)
        return
      }
      if (typeof resolvePeerOrigin !== 'function') {
        resolve(false)
        return
      }
      const origin = resolvePeerOrigin()
      if (!origin) {
        resolve(false)
        return
      }
      if (window.location.origin === origin) {
        resolve(false)
        return
      }

      const iframe = document.createElement('iframe')
      iframe.style.cssText =
        'position:absolute;width:0;height:0;border:0;visibility:hidden'
      iframe.src = `${origin}${bridgeIframePath}`
      let settled = false
      const cleanup = (val) => {
        if (settled) return
        settled = true
        window.removeEventListener('message', onMessage)
        try {
          iframe.remove()
        } catch {}
        resolve(val)
      }
      const onMessage = (ev) => {
        if (ev.origin !== origin) return
        const t = ev.data?.type
        if (t === 'symbols-session-ready') {
          try {
            iframe.contentWindow?.postMessage(
              { type: 'symbols-session-request' },
              origin
            )
          } catch {}
          return
        }
        if (t !== 'symbols-session-response') return
        if (!ev.data.ok) {
          cleanup(false)
          return
        }
        const tokens = ev.data.sdkTokens || {}
        let wrote = false
        for (const [k, v] of Object.entries(tokens)) {
          if (v != null) {
            localStorage.setItem(k, String(v))
            wrote = true
          }
        }
        if (
          !tokens.symbols_access_token &&
          tokens.symbols_bridge_access_token
        ) {
          localStorage.setItem(
            'symbols_access_token',
            String(tokens.symbols_bridge_access_token)
          )
          if (tokens.symbols_bridge_expires_at) {
            localStorage.setItem(
              'symbols_expires_at',
              String(tokens.symbols_bridge_expires_at)
            )
          }
          wrote = true
        }
        cleanup(wrote)
      }
      window.addEventListener('message', onMessage)
      iframe.addEventListener('load', () => {
        try {
          iframe.contentWindow?.postMessage(
            { type: 'symbols-session-request' },
            origin
          )
        } catch {}
      })
      document.body.appendChild(iframe)
      setTimeout(() => cleanup(false), 4000)
    })
  }

  // Used to patch localStorage so every token write was mirrored into the
  // parent-domain cookie. Now it only deletes an old copy of that cookie.
  function installAuthSync() {
    if (typeof window === 'undefined') return
    clearAuthCookie()
  }

  function uninstallAuthSync() {}

  return {
    TOKEN_KEYS: tokenKeys,
    collectLocalSession,
    collectSdkTokens,
    hydrateAuthFromCookie,
    hydrateAuthFromIframeBridge,
    persistAuthToCookie,
    clearAuthCookie,
    installAuthSync,
    uninstallAuthSync
  }
}
