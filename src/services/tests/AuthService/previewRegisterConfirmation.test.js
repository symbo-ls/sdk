import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Server core/auth-takeover-paths review r4 N2: the shell confirm page names
// the account a confirmation token signs in, read from the server via
// previewRegisterConfirmation(token) → POST /auth/register-confirmation/preview.
// It needs no session (the link opens on any device) and never adopts tokens.

const sandbox = sinon.createSandbox()

test('previewRegisterConfirmation posts { token } and resolves the address', async (t) => {
  const svc = new AuthService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { email: 'b@corp.test' } })
  const out = await svc.previewRegisterConfirmation('tok-1')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/register-confirmation/preview')
  t.equal(opts.method, 'POST')
  t.deepEqual(JSON.parse(opts.body), { token: 'tok-1' })
  t.equal(opts.methodName, 'previewRegisterConfirmation')
  t.deepEqual(out, { email: 'b@corp.test' })
  sandbox.restore()
  t.end()
})

test('previewRegisterConfirmation rejects with the server message on an unknown token', async (t) => {
  const svc = new AuthService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'Email verification token is invalid' })
  try {
    await svc.previewRegisterConfirmation('bad')
    t.fail('should reject')
  } catch (err) {
    t.match(err.message, /token is invalid/)
  }
  sandbox.restore()
  t.end()
})

test('previewRegisterConfirmation never touches the session', async (t) => {
  const svc = new AuthService()
  const setTokens = sandbox.spy()
  svc._tokenManager = { setTokens }
  svc._emitAuth = sandbox.spy()
  sandbox.stub(svc, '_request').resolves({ success: true, data: { email: 'b@corp.test', tokens: { accessToken: 'x' } } })
  await svc.previewRegisterConfirmation('tok-2')
  t.equal(setTokens.callCount, 0, 'no tokens adopted')
  t.equal(svc._emitAuth.callCount, 0, 'no auth event')
  sandbox.restore()
  t.end()
})

test('previewRegisterConfirmation is a no-init method and has a top-level proxy', async (t) => {
  const svc = new AuthService()
  t.equal(svc._requiresInit('previewRegisterConfirmation'), false)
  const { SERVICE_METHODS } = await import('../../../utils/services.js')
  t.equal(SERVICE_METHODS.previewRegisterConfirmation, 'auth')
  t.end()
})
