// CLI-OAUTH-LOGIN-BROWSER-POLL-NEVER-COMPLETES-1 — the CLI sign-in session id
// must survive the Google OAuth round-trip.
//
// `smbls login` opens my.symbols.app/login?session=<id> and then polls the
// server until that session reads `ready_for_confirm`. Only the browser marks
// it, and it marks it by ATTACHING the id to the auth call it makes after
// Google returns. By then the page sits on /google-auth-callback?code=…&state=…
// and the `?session=` query is gone. So a carrier that reads the query string
// alone marks nothing, the CLI polls a session nobody ever marks, and the user
// gets a bare three-minute timeout.
//
// These tests pin the carrier: the id is written to localStorage on the way
// out and read back from localStorage on the way in, across a FRESH service
// instance (a real page load throws the in-memory copy away).

import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

const STORAGE_KEY = 'plugin_auth_session'

const fakeWindow = (href, store = {}) => ({
  location: { href },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    removeItem: (k) => {
      delete store[k]
    }
  },
  __store: store
})

// Restores the previous global only once `fn` has really finished — an async
// `fn` continues AFTER its synchronous return, and the SDK touches
// window.localStorage in that continuation (_clearPluginSession).
const withWindow = (win, fn) => {
  const had = 'window' in globalThis
  const prev = globalThis.window
  globalThis.window = win
  const restore = () => {
    if (had) globalThis.window = prev
    else delete globalThis.window
  }
  let out
  try {
    out = fn()
  } catch (err) {
    restore()
    throw err
  }
  if (typeof out?.then === 'function') return out.finally(restore)
  restore()
  return out
}

const makeService = () => {
  const svc = new AuthService()
  sinon.stub(svc, '_requireReady').resolves()
  return svc
}

test('plugin session — the ?session= id is written to storage on the login page', t => {
  t.plan(2)
  const win = fakeWindow('https://my.symbols.app/login?session=S-1')

  const resolved = withWindow(win, () => makeService()._resolvePluginSession())

  t.equal(resolved, 'S-1', 'the login page resolves the id from the query')
  t.equal(win.__store[STORAGE_KEY], 'S-1', 'and persists it before leaving for Google')

  sinon.restore()
  t.end()
})

test('plugin session — a FRESH instance recovers the id after the OAuth round-trip', t => {
  t.plan(1)
  // Google has returned. The query now carries code+state and no session id,
  // and the page reloaded, so the in-memory copy is gone.
  const win = fakeWindow(
    'https://my.symbols.app/google-auth-callback?code=4/abc&state=google_oauth_x1',
    { [STORAGE_KEY]: 'S-1' }
  )

  const resolved = withWindow(win, () => makeService()._resolvePluginSession())

  t.equal(resolved, 'S-1', 'storage carries the id across the redirect chain')

  sinon.restore()
  t.end()
})

test('plugin session — the query string ALONE cannot carry it (the defect shape)', t => {
  t.plan(1)
  // Same post-redirect URL, but nothing was persisted on the way out. This is
  // the state a query-string-only carrier leaves behind, and it marks nothing.
  const win = fakeWindow(
    'https://my.symbols.app/google-auth-callback?code=4/abc&state=google_oauth_x1'
  )

  const resolved = withWindow(win, () => makeService()._resolvePluginSession())

  t.equal(resolved, null, 'with no stored copy there is no id left to mark')

  sinon.restore()
  t.end()
})

test('plugin session — googleAuthCallback sends the recovered id to the server', async t => {
  t.plan(3)
  const win = fakeWindow(
    'https://my.symbols.app/google-auth-callback?code=4/abc&state=google_oauth_x1',
    { [STORAGE_KEY]: 'S-1' }
  )

  const svc = withWindow(win, () => makeService())
  const request = sinon
    .stub(svc, '_request')
    .resolves({ success: true, data: { tokens: {} } })

  await withWindow(win, () =>
    svc.googleAuthCallback('4/abc', 'https://my.symbols.app/google-auth-callback')
  )

  const [path, opts] = request.firstCall.args
  const body = JSON.parse(opts.body)
  t.equal(path, '/auth/google/callback', 'the marking call is the OAuth exchange')
  t.equal(body.session, 'S-1', 'the session id rides the body, so the server marks it')
  t.equal(
    win.__store[STORAGE_KEY],
    undefined,
    'a successful sign-in clears the id — it never leaks into the next login'
  )

  sinon.restore()
  t.end()
})

test('plugin session — getMe carries the recovered id for an already-signed-in browser', async t => {
  t.plan(1)
  // The second marking path: the user is ALREADY signed in to my.symbols, so
  // no OAuth call happens at all and /auth/me?session=… is the only request
  // that can mark the CLI session ready.
  const win = fakeWindow('https://my.symbols.app/', { [STORAGE_KEY]: 'S-1' })

  const svc = withWindow(win, () => makeService())
  const request = sinon.stub(svc, '_request').resolves({ success: true, data: {} })

  await withWindow(win, () => svc.getMe())

  t.equal(
    request.firstCall.args[0],
    '/auth/me?session=S-1',
    'the session id rides the query, so the server marks it'
  )

  sinon.restore()
  t.end()
})
