import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Sign in with Apple, redirect (form_post) flow: start + one-time ticket
// exchange. Pinned to the literal routes (the drift analyzer reads them),
// POST bodies, and the anonymous identity rule (never the platform session).

const sandbox = sinon.createSandbox()
const WS = '6aee1fc92f79c854c992389c'

const makeService = () => {
  const svc = new StorefrontService()
  const call = sandbox.stub(svc, '_call').resolves({})
  return { svc, call }
}

test('startStorefrontAppleSignIn: POST /auth/oauth/apple/start { returnUrl }', async (t) => {
  const { svc, call } = makeService()
  await svc.startStorefrontAppleSignIn(WS, { returnUrl: 'https://qrr.ge/signin/apple' })
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'startStorefrontAppleSignIn')
  t.equal(path, `/storefront/${WS}/auth/oauth/apple/start`)
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.body, { returnUrl: 'https://qrr.ge/signin/apple' })
  t.equal(opts.headers, undefined)
  t.throws(() => svc.startStorefrontAppleSignIn(WS, {}), /returnUrl/)
  t.throws(() => svc.startStorefrontAppleSignIn(), /workspaceId/)
  sandbox.restore()
  t.end()
})

test('exchangeStorefrontAppleTicket: POST /auth/oauth/apple/ticket { ticket, binding }', async (t) => {
  const { svc, call } = makeService()
  await svc.exchangeStorefrontAppleTicket(WS, 'tkt', 'bnd')
  const [name, path, opts] = call.firstCall.args
  t.equal(name, 'exchangeStorefrontAppleTicket')
  t.equal(path, `/storefront/${WS}/auth/oauth/apple/ticket`)
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.body, { ticket: 'tkt', binding: 'bnd' })
  t.throws(() => svc.exchangeStorefrontAppleTicket(WS), /ticket/)
  t.throws(() => svc.exchangeStorefrontAppleTicket(WS, 'tkt'), /binding/, 'binding is required')
  sandbox.restore()
  t.end()
})

test('identity rule + flat exposure', (t) => {
  const base = new BaseService({})
  for (const m of ['startStorefrontAppleSignIn', 'exchangeStorefrontAppleTicket']) {
    t.equal(base._requiresInit(m), false, `${m} never attaches the platform token`)
    t.equal(SERVICE_METHODS[m], 'storefront', `${m} is flat-exposed`)
  }
  t.end()
})
