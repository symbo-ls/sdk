// Cross-app auth sync — mirror the Symbols SDK tokens into a parent-domain
// cookie (plus an iframe bridge for dev, where `.localhost` cookies are
// dropped) so peer subdomains share a single signed-in session even though
// their localStorages are origin-isolated.
//
// Ported from the retired @symbo.ls/sdk-supabase-bridge package (deleted with
// the Supabase plane, 2026-07-27). That module ALSO mirrored `sb-*-auth-token`
// Supabase auth-js sessions; nothing writes those keys any more, so this port
// carries only the SDK-token half — same cookie name, same token keys, same
// message contract, so sessions minted before the port keep working.
//
// Trade-off: a cookie on `.symbols.app` is readable by every subdomain.
// Keep user-code rendering subdomains off the parent domain (use a
// separate apex like `.symbo.ls` for preview/mermaid) — otherwise
// untrusted code can read the cookie.

import { readCookie, writeCookie } from './cookies.js'

export const DEFAULT_TOKEN_KEYS = [
  'symbols_access_token',
  'symbols_refresh_token',
  'symbols_expires_at',
  'symbols_expires_in',
  'symbols_bridge_access_token',
  'symbols_bridge_expires_at'
]

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

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

  function hydrateAuthFromCookie() {
    if (typeof localStorage === 'undefined') return false
    const local = collectLocalSession()
    if (isFresh(local)) return false

    const raw = readCookie(sessionCookieName)
    if (!raw) return false
    let cookieSession
    try {
      cookieSession = JSON.parse(raw)
    } catch {
      return false
    }
    if (!isFresh(cookieSession)) return false

    for (const k of tokenKeys) {
      const v = cookieSession[k]
      if (v != null) localStorage.setItem(k, String(v))
    }
    if (
      !cookieSession.symbols_access_token &&
      cookieSession.symbols_bridge_access_token
    ) {
      localStorage.setItem(
        'symbols_access_token',
        String(cookieSession.symbols_bridge_access_token)
      )
      if (cookieSession.symbols_bridge_expires_at) {
        localStorage.setItem(
          'symbols_expires_at',
          String(cookieSession.symbols_bridge_expires_at)
        )
      }
    }
    if (
      !cookieSession.symbols_bridge_access_token &&
      cookieSession.symbols_access_token
    ) {
      localStorage.setItem(
        'symbols_bridge_access_token',
        String(cookieSession.symbols_access_token)
      )
      if (cookieSession.symbols_expires_at) {
        localStorage.setItem(
          'symbols_bridge_expires_at',
          String(cookieSession.symbols_expires_at)
        )
      }
    }
    return true
  }

  function persistAuthToCookie() {
    const session = collectLocalSession()
    if (!session) {
      writeCookie(sessionCookieName, null, 0)
      return
    }
    writeCookie(sessionCookieName, JSON.stringify(session), COOKIE_MAX_AGE)
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

  // Snapshot of the originals + the listeners we register, so installAuthSync
  // can be undone (tests, hot-reload) without poisoning the global JSDOM.
  let _installed = false
  let _uninstall = null
  function installAuthSync() {
    if (_installed || typeof window === 'undefined') return
    _installed = true

    // Snapshot the originals at install time so subsequent re-patches by
    // unrelated shims can't reach back into our wrappers (avoids recursion
    // if another library decides to monkey-patch localStorage on top of
    // ours). Keep both the unbound reference (for restoration on uninstall)
    // and a bound copy (for internal calls).
    const origSetUnbound = localStorage.setItem
    const origRemoveUnbound = localStorage.removeItem
    const origClearUnbound = localStorage.clear
    const origSet = origSetUnbound.bind(localStorage)
    const origRemove = origRemoveUnbound.bind(localStorage)
    const origGet = localStorage.getItem.bind(localStorage)
    const origClear = origClearUnbound.bind(localStorage)

    let persistAuthTimer = null
    const schedulePersistAuth = () => {
      if (persistAuthTimer) return
      persistAuthTimer = setTimeout(() => {
        persistAuthTimer = null
        persistAuthToCookie()
      }, 200)
    }

    const removeAllTokenMirrors = (keptKey) => {
      for (const k of tokenKeys) if (k !== keptKey) origRemove(k)
    }

    const patchedSet = function (key, value) {
      origSet(key, value)
      if (tokenKeys.includes(key)) schedulePersistAuth()
    }
    const patchedRemove = function (key) {
      origRemove(key)
      if (tokenKeys.includes(key)) {
        if (
          key === 'symbols_access_token' ||
          key === 'symbols_bridge_access_token'
        ) {
          removeAllTokenMirrors(key)
        }
        // Use the snapshot getter, not the (possibly re-patched) live one,
        // so no third party can recursively re-enter our patched remove.
        const stillHasAny = tokenKeys.some((k) => origGet(k))
        if (!stillHasAny) clearAuthCookie()
        else schedulePersistAuth()
      }
    }
    const patchedClear = function () {
      origClear()
      clearAuthCookie()
    }

    localStorage.setItem = patchedSet
    localStorage.removeItem = patchedRemove
    localStorage.clear = patchedClear

    const onStorage = (e) => {
      if (!e.key) return
      if (tokenKeys.includes(e.key)) schedulePersistAuth()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      hydrateAuthFromCookie()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)

    _uninstall = () => {
      // Only restore if our patch is still on top; otherwise something else
      // wrapped us and we'd un-wrap into THEIR patch's state — leave alone.
      if (localStorage.setItem === patchedSet)
        localStorage.setItem = origSetUnbound
      if (localStorage.removeItem === patchedRemove)
        localStorage.removeItem = origRemoveUnbound
      if (localStorage.clear === patchedClear)
        localStorage.clear = origClearUnbound
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
      if (persistAuthTimer) clearTimeout(persistAuthTimer)
      _installed = false
      _uninstall = null
    }

    persistAuthToCookie()
  }

  function uninstallAuthSync() {
    if (_uninstall) _uninstall()
  }

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
