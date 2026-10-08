// SESSION HARDENING (2026-10-08, P0 follow-up to the workspace cookie hotfix).
//
// 1. crossAppAuth: the `smbls_session` cookie on the parent domain carried the
//    access + refresh token to every subdomain, user-code preview hosts
//    included. The SDK must never read it into storage and never write a token
//    into it; the only cookie action left is deleting an old copy.
// 2. TokenManager storage: a surface that must not persist a session (a
//    preview origin renders user project code) asks the SDK for memory-only
//    tokens (`new SDK({ tokenStorage: 'memory' })`) and hands over the tokens
//    it received (`sdk.adoptTokens(...)`) without touching Web Storage.
//
// Run: node --test src/utils/tests/sessionHardening.test.js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const makeStore = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()]
  }
}

// A browser-shaped page on a *.symbols.app host with a cookie jar that keeps
// every write (so a write that is later deleted still counts as written).
let local
let writes
let jar
const page = (hostname = 'my.symbols.app') => {
  local = makeStore()
  writes = []
  jar = new Map()
  globalThis.window = {
    location: { hostname, protocol: 'https:', origin: `https://${hostname}` },
    localStorage: local,
    sessionStorage: makeStore(),
    addEventListener: () => {},
    removeEventListener: () => {}
  }
  globalThis.localStorage = local
  globalThis.document = {
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(str) {
      writes.push(str)
      const [pair, ...attrs] = str.split(';').map((s) => s.trim())
      const i = pair.indexOf('=')
      const name = pair.slice(0, i)
      const value = pair.slice(i + 1)
      const gone = attrs.some((a) => /^max-age=0$/i.test(a)) || value === ''
      if (gone) jar.delete(name)
      else jar.set(name, value)
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible'
  }
}
const tokenWrites = () =>
  writes.filter((w) => w.startsWith('smbls_session=') && !/^smbls_session=;/.test(w) && !/max-age=0/i.test(w))

beforeEach(() => page())

const { createCrossAppAuth } = await import('../../crossAppAuth.js')

test('crossAppAuth: a stored session never reaches a cookie (installAuthSync + setItem)', async () => {
  const auth = createCrossAppAuth()
  local.setItem('symbols_access_token', 'acc')
  local.setItem('symbols_refresh_token', 'ref')
  auth.installAuthSync()
  localStorage.setItem('symbols_access_token', 'acc2')
  await new Promise((r) => setTimeout(r, 260)) // past the 200 ms persist debounce
  auth.persistAuthToCookie()
  assert.deepEqual(tokenWrites(), [], 'no token-bearing smbls_session write')
  assert.equal(jar.has('smbls_session'), false)
  auth.uninstallAuthSync()
})

test('crossAppAuth: a cookie session is never copied into storage', () => {
  const auth = createCrossAppAuth()
  jar.set(
    'smbls_session',
    encodeURIComponent(
      JSON.stringify({ symbols_access_token: 'acc', symbols_refresh_token: 'ref', symbols_expires_at: String(Date.now() + 3600e3) })
    )
  )
  assert.equal(auth.hydrateAuthFromCookie(), false)
  assert.deepEqual(local.keys().filter((k) => k.startsWith('symbols_')), [])
})

test('crossAppAuth: an old session cookie is deleted', () => {
  const auth = createCrossAppAuth()
  jar.set('smbls_session', 'x')
  auth.hydrateAuthFromCookie()
  assert.equal(jar.has('smbls_session'), false)
})

test('crossAppAuth: CONTROL — the jar sees a plain write', () => {
  document.cookie = 'probe=1; path=/'
  assert.equal(jar.get('probe'), '1')
})

const { SDK } = await import('../../index.js')
const { getTokenManager } = await import('../TokenManager.js')

test('SDK: tokenStorage memory + adoptTokens keep the session out of Web Storage', async () => {
  delete globalThis.__SMBLS_TOKEN_MANAGER__
  const sdk = new SDK({ apiUrl: 'https://api.example.test', tokenStorage: 'memory' })
  assert.equal(typeof sdk.adoptTokens, 'function')
  await sdk.adoptTokens({ accessToken: 'acc', refreshToken: 'ref', expiresIn: 3600 })
  assert.equal(getTokenManager().getAccessToken(), 'acc')
  assert.deepEqual(local.keys().filter((k) => k.startsWith('symbols_')), [])
  assert.deepEqual(window.sessionStorage.keys().filter((k) => k.startsWith('symbols_')), [])
})

test('SDK: memory storage ignores a session already in localStorage', () => {
  delete globalThis.__SMBLS_TOKEN_MANAGER__
  local.setItem('symbols_access_token', 'stale')
  new SDK({ apiUrl: 'https://api.example.test', tokenStorage: 'memory' })
  assert.equal(getTokenManager().getAccessToken(), null)
})

test('SDK: CONTROL — the default still persists to localStorage', async () => {
  delete globalThis.__SMBLS_TOKEN_MANAGER__
  const tm = getTokenManager({ apiUrl: 'https://api.example.test', storageType: 'localStorage' })
  tm.setTokens({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 })
  assert.equal(local.getItem('symbols_access_token'), 'acc')
})
