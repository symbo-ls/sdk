import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Server CORE-AUTH-TAKEOVER-PATHS D9: a browser/plugin sign-in session
// (`<my>/login?session=<id>`) is armed only by an explicit Continue. The
// workspace step reads the session facts (start time, requester IP, client,
// whether the device code is required) with getSignInSessionInfo(sessionId)
// → GET /auth/session/info?session=…, then arms it for the signed-in account
// with activateSignInSession(sessionId, userCode) → POST /auth/session/activate.

const sandbox = sinon.createSandbox()

test('getSignInSessionInfo GETs /auth/session/info with the session id encoded', async (t) => {
  const svc = new AuthService()
  const info = { status: 'pending', created_at: '2026-10-15T10:00:00.000Z', requester_ip: '203.0.113.9', client: 'cli', code_required: true }
  const req = sandbox.stub(svc, '_request').resolves(info)
  const out = await svc.getSignInSessionInfo('a b/c')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/session/info?session=a%20b%2Fc')
  t.equal(opts.method, 'GET')
  t.equal(opts.methodName, 'getSignInSessionInfo')
  t.deepEqual(out, {
    status: 'pending',
    createdAt: '2026-10-15T10:00:00.000Z',
    requesterIp: '203.0.113.9',
    client: 'cli',
    codeRequired: true
  })
  sandbox.restore()
  t.end()
})

test('getSignInSessionInfo needs no session (no-init) and rejects with the server error', async (t) => {
  const svc = new AuthService()
  t.equal(svc._requiresInit('getSignInSessionInfo'), false)
  const err = new Error('Session expired')
  err.status = 404
  sandbox.stub(svc, '_request').rejects(err)
  try {
    await svc.getSignInSessionInfo('gone')
    t.fail('should reject')
  } catch (e) {
    t.match(e.message, /Session expired/)
    t.equal(e.cause?.status, 404, 'the HTTP status rides on cause')
  }
  sandbox.restore()
  t.end()
})

test('activateSignInSession POSTs { session_id, user_code } with the bearer', async (t) => {
  const svc = new AuthService()
  sandbox.stub(svc, 'isReady').returns(true)
  const req = sandbox.stub(svc, '_request').resolves({ ok: true, status: 'ready_for_confirm' })
  const out = await svc.activateSignInSession('sid-1', 'BCDF-GHJK')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/session/activate')
  t.equal(opts.method, 'POST')
  t.deepEqual(JSON.parse(opts.body), { session_id: 'sid-1', user_code: 'BCDF-GHJK' })
  t.equal(opts.methodName, 'activateSignInSession')
  t.deepEqual(out, { ok: true, status: 'ready_for_confirm' })
  t.equal(svc._requiresInit('activateSignInSession'), true, 'needs the signed-in session')
  sandbox.restore()
  t.end()
})

test('activateSignInSession without a code sends no user_code; a wrong code rejects with the status', async (t) => {
  const svc = new AuthService()
  sandbox.stub(svc, 'isReady').returns(true)
  const wrong = new Error('Enter the code your device shows.')
  wrong.status = 403
  const req = sandbox.stub(svc, '_request')
  req.onFirstCall().resolves({ ok: true })
  req.onSecondCall().rejects(wrong)
  await svc.activateSignInSession('sid-2')
  t.deepEqual(JSON.parse(req.firstCall.args[1].body), { session_id: 'sid-2' })
  try {
    await svc.activateSignInSession('sid-2', 'XXXX-XXXX')
    t.fail('should reject')
  } catch (e) {
    t.equal(e.cause?.status, 403)
  }
  sandbox.restore()
  t.end()
})

test('top-level proxies exist', async (t) => {
  const { SERVICE_METHODS } = await import('../../../utils/services.js')
  t.equal(SERVICE_METHODS.getSignInSessionInfo, 'auth')
  t.equal(SERVICE_METHODS.activateSignInSession, 'auth')
  t.end()
})
