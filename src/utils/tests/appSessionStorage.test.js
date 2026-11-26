// CORE-APP-OAUTH-1 review L2 + I1 (2026-11-26) — an app-scoped "Sign in with
// Symbols" token is kept in the TAB's sessionStorage only, marked 'app'
// (never 'bridge'), never in localStorage, and never beside a full account
// session: adopting it wipes the origin's stored session; a full sign-in or a
// sign-out ends it.
//
// Run: node --test src/utils/tests/appSessionStorage.test.js
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const saved = { window: Object.getOwnPropertyDescriptor(globalThis, 'window') }
afterEach(() => {
  if (saved.window) Object.defineProperty(globalThis, 'window', saved.window)
  else delete globalThis.window
})

const makeStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m
  }
}

const browser = (local = makeStorage(), session = makeStorage()) => {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: local, sessionStorage: session },
    writable: true,
    configurable: true
  })
  return { local, session }
}

const { TokenManager } = await import('../TokenManager.js')
const make = () => new TokenManager({ storageType: 'localStorage' })
const APP = { access_token: 'app.jwt', expires_in: 3600 }

test('an app token lives in sessionStorage only, marked app; the stored full session is wiped', () => {
  const { local, session } = browser()
  const tm = make()
  tm.setTokens({ access_token: 'full.jwt', refresh_token: 'refresh', expires_in: 3600 })
  assert.equal(local.getItem('symbols_refresh_token'), 'refresh')

  assert.equal(tm.adoptAccessToken(APP, { source: 'app' }), true)
  assert.equal(tm.getAccessToken(), 'app.jwt')
  assert.equal(tm.getRefreshToken(), null)
  assert.equal(tm.isAppSession(), true)
  assert.equal(tm.getSessionSource(), 'app')
  assert.equal(tm.isBorrowedSession(), true, 'never sends a refresh token')
  for (const k of local._m.keys()) assert.ok(!k.startsWith('symbols_'), `localStorage keeps ${k}`)
  assert.equal(session.getItem('symbols_access_token'), 'app.jwt')
  assert.equal(session.getItem('symbols_session_source'), 'app')
  tm.scheduleRefresh()
  clearTimeout(tm.refreshTimeout)
})

test('a reload of the tab restores the app session from sessionStorage', () => {
  const { local, session } = browser()
  make().adoptAccessToken(APP, { source: 'app' })
  browser(local, session)
  const again = make()
  assert.equal(again.getAccessToken(), 'app.jwt')
  assert.equal(again.isAppSession(), true)
  // Another tab (a fresh sessionStorage) has no session at all.
  browser(local, makeStorage())
  assert.equal(make().getAccessToken(), null)
})

test('a full sign-in ends the app session; so does a sign-out', () => {
  const { local, session } = browser()
  const tm = make()
  tm.adoptAccessToken(APP, { source: 'app' })
  tm.setTokens({ access_token: 'full.jwt', refresh_token: 'r2', expires_in: 3600 })
  clearTimeout(tm.refreshTimeout)
  assert.equal(tm.isAppSession(), false)
  assert.equal(session.getItem('symbols_access_token'), null)
  assert.equal(local.getItem('symbols_access_token'), 'full.jwt')
  assert.equal(tm.getSessionSource(), 'own')

  const tm2 = make()
  tm2.adoptAccessToken(APP, { source: 'app' })
  tm2.clearTokens()
  assert.equal(tm2.isAppSession(), false)
  assert.equal(session.getItem('symbols_access_token'), null)
  assert.equal(tm2.getAccessToken(), null)
})

test('a bridge adoption is still marked bridge (unchanged)', () => {
  const { local } = browser()
  const tm = make()
  tm.adoptAccessToken(APP)
  assert.equal(tm.getSessionSource(), 'bridge')
  assert.equal(tm.isAppSession(), false)
  assert.equal(local.getItem('symbols_access_token'), 'app.jwt')
})
