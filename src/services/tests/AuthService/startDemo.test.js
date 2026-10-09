import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Contract (server core/auth-takeover-paths): POST /demo/start with an
// EXISTING demo email returns NO tokens — it mails a sign-in link and answers
// { isNew:false, signInLinkSent:true }. The SDK must not report a sign-in then.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  const tokenManager = { setTokens: sinon.spy() }
  svc._tokenManager = tokenManager
  const events = []
  svc._emitAuth = (event) => events.push(event)
  return { svc, tokenManager, events }
}

test('startDemo — new demo with tokens sets tokens and emits SIGNED_IN', async t => {
  const { svc, tokenManager, events } = makeService()
  const data = { isNew: true, accessToken: 'a1', refreshToken: 'r1' }
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.startDemo({ email: 'new@example.com' })

  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/demo/start', 'hits /demo/start')
  t.deepEqual(JSON.parse(opts.body), { email: 'new@example.com' }, 'sends the email')
  t.equal(tokenManager.setTokens.callCount, 1, 'tokens set once')
  t.deepEqual(
    tokenManager.setTokens.firstCall.args[0],
    { access_token: 'a1', refresh_token: 'r1', token_type: 'Bearer' },
    'token shape'
  )
  t.deepEqual(events, ['SIGNED_IN'], 'SIGNED_IN emitted once')
  t.deepEqual(result, data, 'returns response.data')
  sandbox.restore()
  t.end()
})

test('startDemo — existing email (signInLinkSent, no tokens) sets nothing and emits nothing', async t => {
  const { svc, tokenManager, events } = makeService()
  const data = { isNew: false, signInLinkSent: true }
  sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.startDemo({ email: 'old@example.com' })

  t.equal(tokenManager.setTokens.callCount, 0, 'no tokens set')
  t.deepEqual(events, [], 'no SIGNED_IN emitted')
  t.equal(result.signInLinkSent, true, 'caller sees signInLinkSent')
  t.equal(result.isNew, false, 'caller sees isNew:false')
  sandbox.restore()
  t.end()
})

test('startDemo — success without accessToken never emits SIGNED_IN', async t => {
  const { svc, tokenManager, events } = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true, data: { isNew: false } })

  await svc.startDemo({ email: 'x@example.com' })

  t.equal(tokenManager.setTokens.callCount, 0, 'no tokens set')
  t.deepEqual(events, [], 'no SIGNED_IN emitted')
  sandbox.restore()
  t.end()
})

test('startDemo — failure response throws', async t => {
  const { svc, events } = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'nope' })
  try {
    await svc.startDemo({ email: 'x@example.com' })
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /Demo start failed: nope/, 'wraps the message')
  }
  t.deepEqual(events, [], 'no SIGNED_IN emitted')
  sandbox.restore()
  t.end()
})
