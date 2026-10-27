import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Google (One Tap id-token + the popup code flow) and GitHub sign-ins answer
// like login: { user, tokens: { accessToken, refreshToken, accessTokenExp } }.
// They used to set the tokens only — no cached user, no SIGNED_IN — so an
// auth-state subscriber never heard of the sign-in. The workspace shell holds
// a user-less, token-bearing session as "wait for the hydrated tick" and loads
// the signed-in app only on a tick that carries a user: after "Sign in with
// Google" the page stayed signed out until a reload re-ran getMe(). Each OAuth
// path must complete the session the way login does (tokens + user +
// SIGNED_IN), and stay silent when the answer carries no tokens.

const sandbox = sinon.createSandbox()

// A TokenManager double that holds what it is given, so getSession() reads
// the stored session the way the real one does.
const makeTokenManager = () => {
  const tm = {
    tokens: null,
    setTokens: sinon.spy((t) => {
      tm.tokens = t
    }),
    hasTokens: () => !!tm.tokens?.access_token,
    getAccessToken: () => tm.tokens?.access_token || null,
    getRefreshToken: () => tm.tokens?.refresh_token || null
  }
  return tm
}

const makeService = () => {
  const svc = new AuthService()
  const tokenManager = makeTokenManager()
  svc._tokenManager = tokenManager
  return { svc, tokenManager }
}

const user = { id: 'u1', _id: 'u1', email: 'person@x.io', username: 'person' }
const tokens = { accessToken: 'a1', refreshToken: 'r1', accessTokenExp: { expiresIn: 900 } }

const PATHS = [
  {
    name: 'googleAuth',
    endpoint: '/auth/google',
    call: (svc) => svc.googleAuth('id-token-1')
  },
  {
    name: 'googleAuthCallback',
    endpoint: '/auth/google/callback',
    call: (svc) => svc.googleAuthCallback('code-1', 'postmessage')
  },
  {
    name: 'githubAuth',
    endpoint: '/auth/github',
    call: (svc) => svc.githubAuth('code-2')
  }
]

for (const path of PATHS) {
  test(`${path.name} — answer with tokens: a subscriber hears SIGNED_IN with the user`, async (t) => {
    const { svc, tokenManager } = makeService()
    const heard = []
    svc.onAuthStateChange((event, session) => heard.push({ event, session }))
    const data = { user, tokens }
    const req = sandbox.stub(svc, '_request').resolves({ success: true, data })

    const result = await path.call(svc)

    t.equal(req.firstCall.args[0], path.endpoint, 'endpoint')
    t.equal(tokenManager.setTokens.callCount, 1, 'tokens set once')
    t.deepEqual(
      tokenManager.setTokens.firstCall.args[0],
      { access_token: 'a1', refresh_token: 'r1', expires_in: 900, token_type: 'Bearer' },
      'token shape matches login'
    )
    t.deepEqual(
      heard.map((h) => h.event),
      ['INITIAL_SESSION', 'SIGNED_IN'],
      'SIGNED_IN once, after the subscribe-time INITIAL_SESSION'
    )
    const signedIn = heard[1]?.session
    t.equal(signedIn?.access_token, 'a1', 'the SIGNED_IN session carries the new token')
    t.deepEqual(signedIn?.user, user, 'the SIGNED_IN session carries the answered user')
    t.deepEqual(svc.getSession()?.user, user, 'getSession() returns the answered user')
    t.deepEqual(result, data, 'returns response.data')
    sandbox.restore()
    t.end()
  })

  test(`${path.name} — answer without tokens: sets nothing, emits nothing`, async (t) => {
    const { svc, tokenManager } = makeService()
    const heard = []
    svc.onAuthStateChange((event) => heard.push(event))
    sandbox.stub(svc, '_request').resolves({ success: true, data: { user } })

    await path.call(svc)

    t.equal(tokenManager.setTokens.callCount, 0, 'no tokens set')
    t.deepEqual(heard, ['INITIAL_SESSION'], 'no auth event after subscribe')
    t.notOk(svc._currentUser, 'no user cached without a session')
    sandbox.restore()
    t.end()
  })
}
