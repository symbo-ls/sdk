// getSignupPolicy() — GET /core/auth/signup-policy (server CORE r1): the
// sign-up policy a sign-up form reads BEFORE the person types. The server
// contract (server src/core/utils/signupPolicy.js, its route in
// src/domains/auth/routes/auth.js and signupPolicy.http.test.js):
//
//   - PUBLIC: no requireAuth on the route and a token changes nothing, so the
//     SDK attaches none (a signed-out Fly / sign-up page calls it);
//     `Cache-Control: public, max-age=300`;
//   - the BARE object, no { success, data } envelope:
//       { password: { minLength, lower, upper, digit, special },
//         firstBuildFree: <boolean>, signupCredits: <integer> }
//
// WS1 feature-detects the method: without it, a free first build is never
// assumed.
//
// Fixtures only: no network is touched (globalThis.fetch is replaced per test).
import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'
import { TokenManager } from '../../../utils/TokenManager.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

const sandbox = sinon.createSandbox()

const POLICY = {
  password: { minLength: 8, lower: true, upper: true, digit: true, special: '@$!%*?&' },
  firstBuildFree: true,
  signupCredits: 100
}

const makeService = () => {
  const svc = new AuthService()
  svc._requireReady = () => {}
  return svc
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

test('getSignupPolicy is a method of the auth service, flat-exposed by the SDK', t => {
  t.plan(2)
  t.equal(typeof new AuthService().getSignupPolicy, 'function', 'AuthService.getSignupPolicy exists')
  t.equal(SERVICE_METHODS.getSignupPolicy, 'auth', 'sdk.getSignupPolicy() dispatches to AuthService')
})

test('getSignupPolicy is public: no bearer token is attached', t => {
  t.plan(1)
  t.equal(new AuthService()._requiresInit('getSignupPolicy'), false, 'a no-init method')
})

test('getSignupPolicy GETs /auth/signup-policy and returns the bare policy unchanged', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves(POLICY)
  const out = await svc.getSignupPolicy()
  t.equal(req.callCount, 1, 'one request')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/signup-policy', 'the route (the SDK adds /core)')
  t.equal(opts.method, 'GET', 'a GET')
  t.equal(opts.methodName, 'getSignupPolicy', 'named for the no-init and telemetry rules')
  t.equal(opts.body, undefined, 'no body')
  t.deepEqual(out, POLICY, 'the bare contract object, as the server sent it')
  sandbox.restore()
  t.end()
})

test('getSignupPolicy rejects with the HTTP status on the error when the route fails', async t => {
  const svc = makeService()
  sandbox.stub(svc, '_request').rejects(Object.assign(new Error('HTTP 503: Service Unavailable'), { status: 503 }))
  try {
    await svc.getSignupPolicy()
    t.fail('should reject')
  } catch (err) {
    t.equal(err.status, 503, 'the status rides on the error')
  }
  sandbox.restore()
  t.end()
})

test('over the real transport: <apiUrl>/core/auth/signup-policy, a GET with no Authorization even when signed in', async t => {
  const svc = makeService()
  svc._apiUrl = 'http://api.fixture.test'
  const tm = new TokenManager({ storageType: 'memory', apiUrl: 'http://api.fixture.test' })
  tm.setTokens({ access_token: 'fixture-access-1', refresh_token: 'fixture-refresh-1', expires_in: 3600 })
  svc._tokenManager = tm
  try {
    await withFetch(
      async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => POLICY }),
      async (calls) => {
        const out = await svc.getSignupPolicy()
        t.equal(calls.length, 1, 'one request')
        t.equal(calls[0].url, 'http://api.fixture.test/core/auth/signup-policy', 'the full URL')
        t.equal(String(calls[0].init.method).toUpperCase(), 'GET', 'a GET')
        const headers = calls[0].init.headers || {}
        t.notOk('Authorization' in headers, 'no bearer token on a public, cacheable read')
        t.notOk('Content-Type' in headers, 'no Content-Type on a bodiless read (no CORS preflight)')
        t.deepEqual(out, POLICY, 'the policy, unchanged')
      }
    )
  } finally {
    // The fixture session schedules a refresh timer; a live timer keeps the
    // process (and tape) running for its whole hour.
    tm.destroy()
  }
  t.end()
})
