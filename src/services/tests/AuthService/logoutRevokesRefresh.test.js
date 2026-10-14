// CORE logout-revokes-refresh — AuthService.logout() must hand the session's
// refresh token to POST /core/auth/logout so the server can revoke it.
// Before the fix the SDK posted no body at all, the server removed nothing,
// and a copied refresh token (e.g. the shell's, kept aside on a canvas that
// borrowed the session through the session bridge) stayed usable for its
// full 30-day life after the user signed out.
//
// Fixtures only: every token below is a made-up string; no network is touched
// (globalThis.fetch is replaced per test).
import test from 'tape'
import { AuthService } from '../../AuthService.js'
import { TokenManager } from '../../../utils/TokenManager.js'

const FAR_FUTURE_S = 60 * 60 // access token valid for an hour

const makeService = ({ refresh = 'fixture-refresh-1', source = null, expiresIn = FAR_FUTURE_S } = {}) => {
  const svc = new AuthService()
  svc._requireReady = () => {}
  svc._apiUrl = 'http://api.fixture.test'
  const tm = new TokenManager({ storageType: 'memory', apiUrl: 'http://api.fixture.test' })
  tm.setTokens({ access_token: 'fixture-access-1', refresh_token: refresh, expires_in: expiresIn })
  if (source) tm.storage.setItem('symbols_session_source', source)
  svc._tokenManager = tm
  return { svc, tm }
}

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return impl(url, init)
  }
  try {
    await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

const ok = () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true }) })

const logoutCalls = (calls) => calls.filter(c => c.url.endsWith('/core/auth/logout'))
const bodyOf = (call) => (call.init.body ? JSON.parse(call.init.body) : {})

test('logout — posts the stored refresh token so the server can revoke it', async t => {
  const { svc, tm } = makeService()
  await withFetch(ok, async (calls) => {
    await svc.logout()
    const sent = logoutCalls(calls)
    t.equal(sent.length, 1, 'one POST /core/auth/logout')
    t.equal(bodyOf(sent[0]).refreshToken, 'fixture-refresh-1', 'body carries the session refresh token')
    t.equal(sent[0].init.headers.Authorization, 'Bearer fixture-access-1', 'session access token in the header')
  })
  t.equal(tm.getAccessToken(), null, 'access token cleared')
  t.equal(tm.getRefreshToken(), null, 'refresh token cleared')
  t.equal(tm.storage.getItem('symbols_refresh_token'), null, 'refresh token gone from storage')
  t.end()
})

test('logout — a borrowed (bridge-marked) session never sends a refresh token', async t => {
  // A canvas that borrowed the shell's session is access-only; any refresh
  // token in its storage is NOT its own (a kept-aside copy). Sending it would
  // let a canvas sign-out revoke — or leak — someone else's session.
  const { svc, tm } = makeService({ refresh: 'someone-elses-refresh', source: 'bridge' })
  await withFetch(ok, async (calls) => {
    await svc.logout()
    const sent = logoutCalls(calls)
    t.equal(sent.length, 1, 'still posts /core/auth/logout')
    t.notOk('refreshToken' in bodyOf(sent[0]), 'no refresh token in the body')
    t.notOk(JSON.stringify(sent[0].init).includes('someone-elses-refresh'), 'the copy appears nowhere in the request')
  })
  t.equal(tm.getAccessToken(), null, 'local session still cleared')
  t.end()
})

test('logout — an expired access token is not refreshed first (refresh would rotate the token we revoke)', async t => {
  const { svc, tm } = makeService({ expiresIn: -120 })
  await withFetch(ok, async (calls) => {
    await svc.logout()
    t.equal(calls.filter(c => c.url.endsWith('/core/auth/refresh')).length, 0, 'no /auth/refresh round-trip')
    const sent = logoutCalls(calls)
    t.equal(sent.length, 1, 'one logout POST')
    t.equal(bodyOf(sent[0]).refreshToken, 'fixture-refresh-1', 'the un-rotated refresh token is revoked')
  })
  t.equal(tm.getRefreshToken(), null, 'cleared')
  t.end()
})

test('logout — persona overlay: the header carries the real session token, not the persona', async t => {
  const { svc, tm } = makeService()
  tm.setPersonaToken?.('fixture-persona-access')
  await withFetch(ok, async (calls) => {
    await svc.logout()
    const sent = logoutCalls(calls)
    t.equal(sent[0].init.headers.Authorization, 'Bearer fixture-access-1', 'session access token, not the persona overlay')
  })
  t.end()
})

test('logout — network down: local session is cleared anyway', async t => {
  const { svc, tm } = makeService()
  let signedOut = 0
  svc._emitAuth = (ev) => { if (ev === 'SIGNED_OUT') signedOut++ }
  await withFetch(async () => { throw new TypeError('Failed to fetch') }, async () => {
    try {
      await svc.logout()
      t.pass('resolved')
    } catch (err) {
      t.ok(/Logout failed/.test(err.message), 'rejects with Logout failed (unchanged contract)')
    }
  })
  t.equal(tm.getAccessToken(), null, 'access token cleared')
  t.equal(tm.getRefreshToken(), null, 'refresh token cleared')
  t.equal(tm.storage.getItem('symbols_access_token'), null, 'storage cleared')
  t.equal(signedOut, 1, 'SIGNED_OUT emitted once')
  t.end()
})

test('logout — no tokens at all: posts with no refresh token and still clears', async t => {
  const svc = new AuthService()
  svc._requireReady = () => {}
  svc._apiUrl = 'http://api.fixture.test'
  const tm = new TokenManager({ storageType: 'memory' })
  svc._tokenManager = tm
  await withFetch(ok, async (calls) => {
    await svc.logout()
    const sent = logoutCalls(calls)
    t.equal(sent.length, 1, 'posts once')
    t.notOk('refreshToken' in bodyOf(sent[0]), 'no refresh token')
    t.notOk(sent[0].init.headers.Authorization, 'no Authorization header')
  })
  t.end()
})
