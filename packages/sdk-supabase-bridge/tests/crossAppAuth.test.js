import test from 'tape'
import { createCrossAppAuth } from '../src/crossAppAuth.js'

// Minimal browser shim. JSDOM is not a dep here, so we mock the surface
// crossAppAuth touches: localStorage, document.cookie, window listeners,
// document visibility events.
const installBrowserShim = () => {
  const store = new Map()
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    get length () { return store.size },
    key: (i) => Array.from(store.keys())[i] || null
  }
  Object.defineProperty(localStorage, 'keys', { value: () => Array.from(store.keys()) })
  // Object.keys(localStorage) is what crossAppAuth uses to enumerate
  // stored items. Report both stored keys + the target's own keys so the
  // proxy invariants line up; resolve descriptors for stored keys as plain
  // data props and let everything else fall through to the target.
  const proxy = new Proxy(localStorage, {
    ownKeys: (target) => Array.from(new Set([
      ...Reflect.ownKeys(target),
      ...store.keys()
    ])),
    getOwnPropertyDescriptor: (target, prop) => {
      if (store.has(prop)) {
        return { value: store.get(prop), writable: true, enumerable: true, configurable: true }
      }
      return Object.getOwnPropertyDescriptor(target, prop)
    }
  })

  const cookieStore = new Map()
  const document = {
    _listeners: {},
    addEventListener: function (k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn) },
    removeEventListener: function (k, fn) {
      this._listeners[k] = (this._listeners[k] || []).filter((x) => x !== fn)
    },
    visibilityState: 'visible',
    get cookie () {
      return Array.from(cookieStore.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie (raw) {
      const [pair] = raw.split(';')
      const [k, ...rest] = pair.split('=')
      const v = rest.join('=')
      const isDelete = /max-age=0/.test(raw)
      if (isDelete) cookieStore.delete(k.trim())
      else cookieStore.set(k.trim(), v)
    }
  }
  const window = {
    location: { hostname: 'app.symbols.app', protocol: 'https:', origin: 'https://app.symbols.app' },
    _listeners: {},
    addEventListener: function (k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn) },
    removeEventListener: function (k, fn) {
      this._listeners[k] = (this._listeners[k] || []).filter((x) => x !== fn)
    },
    localStorage: proxy
  }
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage
  }
  globalThis.window = window
  globalThis.document = document
  globalThis.localStorage = proxy
  return () => {
    globalThis.window = prev.window
    globalThis.document = prev.document
    globalThis.localStorage = prev.localStorage
  }
}

test('isSupabaseSessionFresh treats missing expiry as stale', async (t) => {
  t.plan(2)
  const restore = installBrowserShim()
  const auth = createCrossAppAuth()
  // Round-trip via cookie: hydrate refuses an entry with no expires_at.
  const key = 'sb-abcd123-auth-token'
  document.cookie = `smbls_sb_sessions=${encodeURIComponent(JSON.stringify({ [key]: JSON.stringify({ access_token: 'x' }) }))}; max-age=3600`
  const wrote = auth.hydrateSupabaseSessionsFromCookie()
  t.equal(wrote, false, 'session without expires_at is not hydrated')
  // Future-expiry entries do hydrate.
  const future = Math.floor(Date.now() / 1000) + 600
  document.cookie = `smbls_sb_sessions=${encodeURIComponent(JSON.stringify({ [key]: JSON.stringify({ access_token: 'y', expires_at: future }) }))}; max-age=3600`
  localStorage.removeItem(key)
  const wrote2 = auth.hydrateSupabaseSessionsFromCookie()
  t.equal(wrote2, true, 'fresh session is hydrated')
  restore()
})

test('installAuthSync is idempotent and uninstall restores originals', async (t) => {
  t.plan(4)
  const restore = installBrowserShim()
  const auth = createCrossAppAuth()
  const origSet = localStorage.setItem
  auth.installAuthSync()
  t.notEqual(localStorage.setItem, origSet, 'setItem patched')
  // Second install is a no-op.
  const patchedSet = localStorage.setItem
  auth.installAuthSync()
  t.equal(localStorage.setItem, patchedSet, 'second installAuthSync is a no-op')
  auth.uninstallAuthSync()
  t.equal(localStorage.setItem, origSet, 'uninstall restores original setItem')
  // Re-install works after uninstall.
  auth.installAuthSync()
  t.notEqual(localStorage.setItem, origSet, 'can re-install after uninstall')
  auth.uninstallAuthSync()
  restore()
})

test('cookie persistence round-trips SDK tokens', async (t) => {
  t.plan(2)
  const restore = installBrowserShim()
  const auth = createCrossAppAuth()
  localStorage.setItem('symbols_access_token', 'tok-1')
  localStorage.setItem('symbols_expires_at', String(Date.now() + 60_000))
  auth.persistAuthToCookie()
  // Wipe local — hydrate from cookie should restore the token.
  localStorage.removeItem('symbols_access_token')
  localStorage.removeItem('symbols_expires_at')
  const wrote = auth.hydrateAuthFromCookie()
  t.equal(wrote, true, 'cookie hydrates back into localStorage')
  t.equal(localStorage.getItem('symbols_access_token'), 'tok-1')
  restore()
})
