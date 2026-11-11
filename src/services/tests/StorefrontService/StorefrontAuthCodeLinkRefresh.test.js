import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Storefront customer passwordless code sign-in, provider link / unlink and
// token refresh. Each wrapper is pinned to its literal route (the server's
// drift analyzer reads the same literals), its HTTP method, its body, and its
// identity rule: a storefront-CUSTOMER token rides as a one-off Authorization
// header, or nothing does — never the SDK's platform session.

const sandbox = sinon.createSandbox()
const WS = '6aadb5e0d03299e6a0719dcc'
const TOKEN = 'customer-token-1'

const makeService = () => {
  const svc = new StorefrontService()
  const call = sandbox.stub(svc, '_call').resolves({})
  return { svc, call }
}

const done = (t) => {
  sandbox.restore()
  t.end()
}

test('requestStorefrontCustomerOtp forwards purpose "login" to /auth/request-otp', async (t) => {
  const { svc, call } = makeService()
  await svc.requestStorefrontCustomerOtp(WS, { email: 'a@example.com', purpose: 'login' })
  t.equal(call.firstCall.args[1], `/storefront/${WS}/auth/request-otp`)
  t.deepEqual(call.firstCall.args[2].body, { phone: undefined, email: 'a@example.com', purpose: 'login' })
  done(t)
})

test('signInStorefrontCustomerWithOtp: POST /auth/otp-login, anonymous', async (t) => {
  const { svc, call } = makeService()
  await svc.signInStorefrontCustomerWithOtp(WS, { email: 'a@example.com', code: '123456', fullName: 'Ana' })
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'signInStorefrontCustomerWithOtp')
  t.equal(path, `/storefront/${WS}/auth/otp-login`)
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.body, { email: 'a@example.com', phone: undefined, code: '123456', fullName: 'Ana' })
  t.equal(opts.headers, undefined, 'no Authorization header at all')
  t.throws(() => svc.signInStorefrontCustomerWithOtp(), /workspaceId/)
  done(t)
})

test('linkStorefrontCustomerProvider: POST /auth/link/:provider with the customer token', async (t) => {
  const { svc, call } = makeService()
  await svc.linkStorefrontCustomerProvider(WS, 'google', { idToken: 'gid' }, TOKEN)
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'linkStorefrontCustomerProvider')
  t.equal(path, `/storefront/${WS}/auth/link/google`)
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.body, { idToken: 'gid', accessToken: undefined, nonce: undefined })
  t.deepEqual(opts.headers, { Authorization: `Bearer ${TOKEN}` })
  await svc.linkStorefrontCustomerProvider(WS, 'facebook', { accessToken: 'fbt' }, TOKEN)
  t.equal(call.secondCall.args[1], `/storefront/${WS}/auth/link/facebook`)
  t.equal(call.secondCall.args[2].body.accessToken, 'fbt')
  t.throws(() => svc.linkStorefrontCustomerProvider(WS, 'github', {}, TOKEN), /provider/)
  t.throws(() => svc.linkStorefrontCustomerProvider(WS, 'google', { idToken: 'x' }), /customerToken/)
  done(t)
})

test('unlinkStorefrontCustomerProvider: DELETE /auth/link/:provider with the customer token', async (t) => {
  const { svc, call } = makeService()
  await svc.unlinkStorefrontCustomerProvider(WS, 'apple', TOKEN)
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'unlinkStorefrontCustomerProvider')
  t.equal(path, `/storefront/${WS}/auth/link/apple`)
  t.equal(opts.method, 'DELETE')
  t.deepEqual(opts.headers, { Authorization: `Bearer ${TOKEN}` })
  t.throws(() => svc.unlinkStorefrontCustomerProvider(WS, 'apple'), /customerToken/)
  t.throws(() => svc.unlinkStorefrontCustomerProvider(WS, 'x', TOKEN), /provider/)
  done(t)
})

test('refreshStorefrontCustomerToken: POST /auth/refresh with the customer token', async (t) => {
  const { svc, call } = makeService()
  await svc.refreshStorefrontCustomerToken(WS, TOKEN)
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'refreshStorefrontCustomerToken')
  t.equal(path, `/storefront/${WS}/auth/refresh`)
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.headers, { Authorization: `Bearer ${TOKEN}` })
  t.throws(() => svc.refreshStorefrontCustomerToken(WS), /customerToken/)
  done(t)
})

test('identity rule + flat exposure for the four new methods', (t) => {
  const base = new BaseService({})
  for (const m of [
    'signInStorefrontCustomerWithOtp',
    'linkStorefrontCustomerProvider',
    'unlinkStorefrontCustomerProvider',
    'refreshStorefrontCustomerToken'
  ]) {
    t.equal(base._requiresInit(m), false, `${m} never attaches the platform token`)
    t.equal(SERVICE_METHODS[m], 'storefront', `${m} is flat-exposed`)
    t.equal(typeof StorefrontService.prototype[m], 'function', `${m} exists`)
  }
  t.end()
})
