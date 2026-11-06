import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// CORE-ONBOARDING-SELF-JOIN-1 — `register(data, { signIn: true })` completes
// the session the way login does (tokens + cached user + SIGNED_IN), so a
// standalone site lands signed in right after sign-up. Without the option
// register stays as it was: nothing stored, no event — the workspace shell
// keeps the tokens aside and adopts them only on "Continue".

const sandbox = sinon.createSandbox()

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
  sandbox.stub(svc, '_createSubdomainRecords').resolves()
  return { svc, tokenManager }
}

const user = { id: 'u9', _id: 'u9', email: 'new@x.io', username: 'newbie' }
const tokens = { accessToken: 'a9', refreshToken: 'r9', accessTokenExp: { expiresIn: 900 } }
const DATA = { name: 'New', email: 'new@x.io', password: 'Pw-123456!x' }

test('register({ signIn: true }) — tokens stored, user cached, SIGNED_IN once', async (t) => {
  const { svc, tokenManager } = makeService()
  const heard = []
  svc.onAuthStateChange((event, session) => heard.push({ event, session }))
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { user, tokens } })

  const result = await svc.register(DATA, { signIn: true })

  t.equal(req.firstCall.args[0], '/auth/register')
  t.notOk('signIn' in JSON.parse(req.firstCall.args[1].body), 'the option never reaches the body')
  t.equal(tokenManager.setTokens.callCount, 1)
  t.deepEqual(tokenManager.setTokens.firstCall.args[0], {
    access_token: 'a9',
    refresh_token: 'r9',
    expires_in: 900,
    token_type: 'Bearer'
  })
  t.deepEqual(heard.map((h) => h.event), ['INITIAL_SESSION', 'SIGNED_IN'])
  t.equal(heard[1].session?.user?.email, 'new@x.io', 'the SIGNED_IN tick carries the user')
  t.deepEqual(result, { user, tokens }, 'return value unchanged')
  sandbox.restore()
  t.end()
})

test('register() without the option — unchanged: nothing stored, no event', async (t) => {
  const { svc, tokenManager } = makeService()
  const heard = []
  svc.onAuthStateChange((event) => heard.push(event))
  sandbox.stub(svc, '_request').resolves({ success: true, data: { user, tokens } })

  const result = await svc.register(DATA)

  t.equal(tokenManager.setTokens.callCount, 0, 'no tokens stored')
  t.deepEqual(heard, ['INITIAL_SESSION'], 'no SIGNED_IN')
  t.deepEqual(result.tokens, tokens, 'tokens still handed back for a later adoptTokens')
  sandbox.restore()
  t.end()
})

test('register({ signIn: true }) with an answer that carries no tokens stays silent', async (t) => {
  const { svc, tokenManager } = makeService()
  const heard = []
  svc.onAuthStateChange((event) => heard.push(event))
  sandbox.stub(svc, '_request').resolves({ success: true, data: { user } })
  await svc.register(DATA, { signIn: true })
  t.equal(tokenManager.setTokens.callCount, 0)
  t.deepEqual(heard, ['INITIAL_SESSION'])
  sandbox.restore()
  t.end()
})
