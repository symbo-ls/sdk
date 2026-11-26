import test from 'tape'
import sinon from 'sinon'
import crypto from 'node:crypto'
import { AuthService } from '../../AuthService.js'

// "Sign in with Symbols" for a project's own site (server CORE-APP-OAUTH-1):
// startAppAuthorization sends the browser to the shell's consent page with a
// PKCE S256 challenge and keeps the verifier in sessionStorage;
// completeAppAuthorization, on the return, exchanges the code with that
// verifier, keeps the app token as an access-only session and cleans the
// address. Pins the request shape, the state binding (unknown, expired,
// refused, replayed) and that the exchange never carries a bearer token.

const WS = 'a'.repeat(24)
const SHELL = 'https://my.shell.test'
const ORIGIN = 'https://shop.example.test'

const makeStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length () {
      return m.size
    },
    _m: m
  }
}

const saved = {}
const setup = ({ search = '', pathname = '/' } = {}) => {
  for (const k of ['window', 'sessionStorage', 'localStorage']) saved[k] = globalThis[k]
  const location = {
    origin: ORIGIN,
    pathname,
    search,
    hash: '',
    assign: sinon.spy()
  }
  const history = { state: null, replaceState: sinon.spy() }
  globalThis.window = { location, history }
  globalThis.sessionStorage = makeStorage()
  globalThis.localStorage = makeStorage()
  const svc = new AuthService({ context: { shellUrl: SHELL } })
  svc._context = { shellUrl: SHELL }
  svc._tokenManager = {
    adoptAccessToken: sinon.spy(() => true),
    getAccessToken: () => 'app-token',
    isAppSession: () => true,
    clearTokens: sinon.spy()
  }
  return { svc, location, history }
}
const teardown = () => {
  for (const k of Object.keys(saved)) globalThis[k] = saved[k]
  sinon.restore()
}

const s256 = (v) => crypto.createHash('sha256').update(v).digest('base64url')

test('startAppAuthorization — consent URL with S256 challenge; verifier kept by state', async (t) => {
  const { svc, location } = setup({ pathname: '/admin', search: '?tab=1' })
  try {
    const { url, state } = await svc.startAppAuthorization({ appId: 'appco/shop', workspaceId: WS })
    const u = new URL(url)
    t.equal(u.origin + u.pathname, `${SHELL}/authorize-app`, 'the shell consent page')
    const q = Object.fromEntries(u.searchParams)
    t.equal(q.response_type, 'code')
    t.equal(q.client_id, 'appco/shop')
    t.equal(q.workspace, WS)
    t.equal(q.redirect_uri, `${ORIGIN}/`, 'redirect = this origin, root path')
    t.equal(q.state, state)
    t.equal(q.code_challenge_method, 'S256')
    const entry = JSON.parse(globalThis.sessionStorage.getItem(`symbols_app_auth:${state}`))
    t.ok(/^[A-Za-z0-9_-]{43}$/.test(entry.v), 'a 43-char verifier')
    t.equal(q.code_challenge, s256(entry.v), 'challenge = base64url(SHA-256(verifier))')
    t.equal(entry.returnTo, '/admin?tab=1', 'return path = the current page')
    t.ok(location.assign.calledOnceWith(url), 'the browser goes to the consent page')
    t.notOk(url.includes(entry.v), 'the verifier never rides the URL')
  } finally {
    teardown()
  }
  t.end()
})

test('startAppAuthorization — refuses a bad app id, workspace id or return path', async (t) => {
  const { svc } = setup()
  try {
    for (const bad of ['appco', 'appco--shop', '../x/y', '']) {
      try {
        await svc.startAppAuthorization({ appId: bad, workspaceId: WS })
        t.fail(`accepted ${bad}`)
      } catch (e) {
        t.equal(e.code, 'invalid_app', bad)
      }
    }
    try {
      await svc.startAppAuthorization({ appId: 'appco/shop', workspaceId: 'archy' })
      t.fail('accepted a handle')
    } catch (e) {
      t.equal(e.code, 'invalid_workspace')
    }
    const { state } = await svc.startAppAuthorization({
      appId: 'appco/shop',
      workspaceId: WS,
      returnTo: '//evil.test/x',
      navigate: false
    })
    const entry = JSON.parse(globalThis.sessionStorage.getItem(`symbols_app_auth:${state}`))
    t.equal(entry.returnTo, '/', 'a protocol-relative return path falls back to /')
  } finally {
    teardown()
  }
  t.end()
})

const startThenReturn = async (extra = {}) => {
  const env = setup({ pathname: '/admin' })
  const { state } = await env.svc.startAppAuthorization({
    appId: 'appco/shop',
    workspaceId: WS,
    navigate: false
  })
  env.location.search = `?${new URLSearchParams({ code: 'the-code', state, ...extra })}`
  return { ...env, state }
}

test('completeAppAuthorization — exchanges with the saved verifier, adopts the token, cleans the address', async (t) => {
  const { svc, history, state } = await startThenReturn()
  try {
    const entry = JSON.parse(globalThis.sessionStorage.getItem(`symbols_app_auth:${state}`))
    const req = sinon.stub(svc, '_request').resolves({
      access_token: 'app.jwt',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'records.read',
      app_id: 'appco/shop',
      workspace_id: WS
    })
    const heard = []
    svc._emitAuth = (e) => heard.push(e)
    const out = await svc.completeAppAuthorization()
    t.equal(req.firstCall.args[0], '/oauth/app/token')
    const opts = req.firstCall.args[1]
    t.equal(opts.methodName, 'exchangeAppAuthorizationCode')
    t.equal(opts.method, 'POST')
    t.deepEqual(JSON.parse(opts.body), {
      grant_type: 'authorization_code',
      client_id: 'appco/shop',
      code: 'the-code',
      redirect_uri: `${ORIGIN}/`,
      code_verifier: entry.v
    })
    t.notOk(svc._requiresInit('exchangeAppAuthorizationCode'), 'no bearer token on the exchange')
    t.ok(
      svc._tokenManager.adoptAccessToken.calledOnceWith(
        { access_token: 'app.jwt', expires_in: 3600 },
        { source: 'app' }
      ),
      'adopted as an app session (review I1)'
    )
    t.equal(globalThis.localStorage.getItem('symbols_app_scope'), null, 'no scope in localStorage (review L2)')
    t.ok(history.replaceState.calledOnce, 'the code leaves the address')
    t.equal(history.replaceState.firstCall.args[2], '/admin')
    t.equal(globalThis.sessionStorage.getItem(`symbols_app_auth:${state}`), null, 'the request is spent')
    t.deepEqual(out, { appId: 'appco/shop', workspaceId: WS, scope: 'records.read', expiresIn: 3600, returnTo: '/admin' })
    t.deepEqual(svc.getAppAuthorization(), { appId: 'appco/shop', workspaceId: WS, scope: 'records.read' })
    svc._tokenManager.isAppSession = () => false
    t.equal(svc.getAppAuthorization(), null, 'a full session is no app sign-in')
    svc._tokenManager.isAppSession = () => true
    t.deepEqual(heard, ['SIGNED_IN'])

    // The same return again (a reload of the old address): no request left.
    try {
      await svc.completeAppAuthorization()
      t.fail('a replayed return was accepted')
    } catch (e) {
      t.equal(e.code, 'state_mismatch')
    }
    t.equal(req.callCount, 1, 'no second exchange')
  } finally {
    teardown()
  }
  t.end()
})

test('completeAppAuthorization — null on a normal page load', async (t) => {
  const { svc } = setup({ search: '?q=1' })
  try {
    t.equal(await svc.completeAppAuthorization(), null)
  } finally {
    teardown()
  }
  t.end()
})

test('completeAppAuthorization — unknown state: refused, no exchange, the code leaves the address', async (t) => {
  const { svc, location, history } = setup({ pathname: '/item' })
  try {
    location.search = '?edit=bench&code=c&state=forged-state-123'
    const req = sinon.stub(svc, '_request')
    try {
      await svc.completeAppAuthorization()
      t.fail('accepted')
    } catch (e) {
      t.equal(e.code, 'state_mismatch')
    }
    t.equal(req.callCount, 0)
    // Review L1: the code and the state are stripped; the page's own query stays.
    t.ok(history.replaceState.calledOnce)
    t.equal(history.replaceState.firstCall.args[2], '/item?edit=bench')
  } finally {
    teardown()
  }
  t.end()
})

test('completeAppAuthorization — a refusal on the consent page, and an expired request', async (t) => {
  {
    const { svc, location, state } = await startThenReturn()
    try {
      location.search = `?error=access_denied&state=${state}`
      const req = sinon.stub(svc, '_request')
      try {
        await svc.completeAppAuthorization()
        t.fail('accepted')
      } catch (e) {
        t.equal(e.code, 'access_denied')
      }
      t.equal(req.callCount, 0)
    } finally {
      teardown()
    }
  }
  {
    const { svc, state } = await startThenReturn()
    try {
      const key = `symbols_app_auth:${state}`
      const entry = JSON.parse(globalThis.sessionStorage.getItem(key))
      entry.at = Date.now() - 11 * 60 * 1000
      globalThis.sessionStorage.setItem(key, JSON.stringify(entry))
      const req = sinon.stub(svc, '_request')
      try {
        await svc.completeAppAuthorization()
        t.fail('accepted')
      } catch (e) {
        t.equal(e.code, 'state_expired')
      }
      t.equal(req.callCount, 0)
    } finally {
      teardown()
    }
  }
  t.end()
})

test('completeAppAuthorization — a server refusal keeps its code; a token for another workspace is refused', async (t) => {
  {
    const { svc } = await startThenReturn()
    try {
      const err = new Error('invalid_grant', { cause: { error: 'invalid_grant' } })
      err.status = 400
      sinon.stub(svc, '_request').rejects(err)
      try {
        await svc.completeAppAuthorization()
        t.fail('accepted')
      } catch (e) {
        t.equal(e.code, 'invalid_grant')
        t.equal(e.status, 400)
      }
      t.ok(svc._tokenManager.adoptAccessToken.notCalled)
    } finally {
      teardown()
    }
  }
  {
    const { svc } = await startThenReturn()
    try {
      sinon.stub(svc, '_request').resolves({ access_token: 'x', expires_in: 60, workspace_id: 'b'.repeat(24) })
      try {
        await svc.completeAppAuthorization()
        t.fail('accepted')
      } catch (e) {
        t.equal(e.code, 'state_mismatch')
      }
      t.ok(svc._tokenManager.adoptAccessToken.notCalled)
    } finally {
      teardown()
    }
  }
  t.end()
})

test('describe / approve — the shell calls of the consent page', async (t) => {
  const { svc } = setup()
  try {
    const call = sinon.stub(svc, '_call').resolves({ ok: 1 })
    await svc.describeAppAuthorization({ client_id: 'appco/shop', state: 's t' })
    t.equal(call.firstCall.args[0], 'describeAppAuthorization')
    t.equal(call.firstCall.args[1], '/oauth/app/authorize?client_id=appco%2Fshop&state=s+t')
    await svc.approveAppAuthorization({ client_id: 'appco/shop' })
    t.equal(call.secondCall.args[1], '/oauth/app/authorize')
    t.deepEqual(call.secondCall.args[2], { method: 'POST', body: { client_id: 'appco/shop' } })
  } finally {
    teardown()
  }
  t.end()
})

test('sign-out forgets the app scope', async (t) => {
  const { svc } = setup()
  try {
    globalThis.sessionStorage.setItem('symbols_app_scope', JSON.stringify({ appId: 'a/b', workspaceId: WS }))
    svc._clearLocalSession()
    t.equal(globalThis.sessionStorage.getItem('symbols_app_scope'), null)
    t.ok(svc._tokenManager.clearTokens.calledOnce)
  } finally {
    teardown()
  }
  t.end()
})

test('the return path: a deep path comes back; a foreign one falls back to /', async (t) => {
  const cases = [
    ['/item/garden-bench?edit=1#top', '/item/garden-bench?edit=1#top'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['/\\evil', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/']
  ]
  for (const [given, want] of cases) {
    const { svc } = setup()
    try {
      const { state } = await svc.startAppAuthorization({ appId: 'appco/shop', workspaceId: WS, returnTo: given, navigate: false })
      const entry = JSON.parse(globalThis.sessionStorage.getItem(`symbols_app_auth:${state}`))
      t.equal(entry.returnTo, want, JSON.stringify(given))
    } finally {
      teardown()
    }
  }
  t.end()
})
