import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// Server core/auth-takeover-paths review r3 D4 (Nika: "Ask for a password on
// confirm"): a confirm whose first-proof cleanup dropped the pre-set password
// answers a fresh session AND a single-use `setPasswordToken`. The confirm
// page then asks for a password and calls setInitialPassword(token, password)
// → POST /auth/set-initial-password. The token is the only credential: the
// method is a no-init method (no bearer). confirmRegistration may also send
// the signup password as a proof.

const sandbox = sinon.createSandbox()

test('setInitialPassword posts { token, password } to /auth/set-initial-password', async (t) => {
  const svc = new AuthService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, message: 'Password set' })
  const out = await svc.setInitialPassword('set-tok', 'New-Pw-1!x')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/set-initial-password')
  t.equal(opts.method, 'POST')
  t.deepEqual(JSON.parse(opts.body), { token: 'set-tok', password: 'New-Pw-1!x' })
  t.equal(opts.methodName, 'setInitialPassword')
  t.ok(out, 'resolves on success')
  sandbox.restore()
  t.end()
})

test('setInitialPassword rejects with the server message on a refusal', async (t) => {
  const svc = new AuthService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'This password link is invalid or has expired' })
  try {
    await svc.setInitialPassword('bad', 'New-Pw-1!x')
    t.fail('should reject')
  } catch (err) {
    t.match(err.message, /invalid or has expired/)
  }
  sandbox.restore()
  t.end()
})

test('setInitialPassword needs no session: it is a no-init method', async (t) => {
  const svc = new AuthService()
  t.equal(svc._requiresInit('setInitialPassword'), false)
  t.end()
})

test('confirmRegistration sends the signup password as a proof only when given', async (t) => {
  const svc = new AuthService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { user: { id: 'u' } } })
  await svc.confirmRegistration('tok-1', { password: 'Signup-Pw-1!x' })
  t.deepEqual(JSON.parse(req.firstCall.args[1].body), { token: 'tok-1', password: 'Signup-Pw-1!x' })
  await svc.confirmRegistration('tok-2')
  t.deepEqual(JSON.parse(req.secondCall.args[1].body), { token: 'tok-2' })
  sandbox.restore()
  t.end()
})

test('the top-level proxy exposes setInitialPassword', async (t) => {
  const { SERVICE_METHODS } = await import('../../../utils/services.js')
  t.equal(SERVICE_METHODS.setInitialPassword, 'auth')
  t.end()
})
