import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Server core/auth-takeover-paths: confirming an address on an UNVERIFIED
// account from a browser that holds no session for it (the claim link opened
// on another device) drops the password set before the proof and answers
//   { user, tokens: { accessToken, refreshToken, accessTokenExp, … } }
// — a fresh session for the inbox owner. Without adopting it, that user has
// no password and no session. confirmRegistration must adopt the tokens the
// way login does (TokenManager.setTokens + SIGNED_IN), and must stay silent
// when the answer carries none.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  const tokenManager = { setTokens: sinon.spy() }
  svc._tokenManager = tokenManager
  const events = []
  svc._emitAuth = (event) => events.push(event)
  return { svc, tokenManager, events }
}

test('confirmRegistration — answer with tokens: adopts them and emits SIGNED_IN', async t => {
  const { svc, tokenManager, events } = makeService()
  svc._currentUser = { id: 'someone-else' }
  const data = {
    user: { id: 'u1', email: 'new@x.io', emailVerified: true },
    tokens: { accessToken: 'a1', refreshToken: 'r1', accessTokenExp: { expiresIn: 900 } }
  }
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.confirmRegistration('tok-1')

  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/register-confirmation', 'endpoint')
  t.deepEqual(JSON.parse(opts.body), { token: 'tok-1' }, 'body')
  t.equal(tokenManager.setTokens.callCount, 1, 'tokens set once')
  t.deepEqual(
    tokenManager.setTokens.firstCall.args[0],
    { access_token: 'a1', refresh_token: 'r1', expires_in: 900, token_type: 'Bearer' },
    'token shape matches login'
  )
  t.deepEqual(events, ['SIGNED_IN'], 'SIGNED_IN once')
  t.equal(svc._currentUser, null, 'a stale cached user is dropped — the session is the new account')
  t.deepEqual(result, data, 'returns response.data (tokens included)')
  sandbox.restore()
  t.end()
})

test('confirmRegistration — answer without tokens: sets nothing, emits nothing', async t => {
  const { svc, tokenManager, events } = makeService()
  const data = { user: { id: 'u1', emailVerified: true } }
  sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.confirmRegistration('tok-2')

  t.equal(tokenManager.setTokens.callCount, 0, 'no tokens set')
  t.deepEqual(events, [], 'no auth event')
  t.deepEqual(result, data, 'returns response.data')
  sandbox.restore()
  t.end()
})

test('confirmRegistration — 409 keeps the HTTP status on the cause', async t => {
  const { svc, events } = makeService()
  const http = new Error('That email already has a Symbols account', {
    cause: { error: 'Email taken' }
  })
  http.status = 409
  sandbox.stub(svc, '_request').rejects(http)
  try {
    await svc.confirmRegistration('tok-3')
    t.fail('should throw')
  } catch (e) {
    t.equal(e.cause?.status, 409, 'cause.status is 409')
    t.equal(e.cause?.cause?.error, 'Email taken', 'server body reachable')
  }
  t.deepEqual(events, [], 'no auth event')
  sandbox.restore()
  t.end()
})
