import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new StorefrontService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('listStorefrontProducts GETs /storefront/:workspaceId/products with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws1')
  t.equal(stub.firstCall.args[0], 'listStorefrontProducts', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/products', 'no query string')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts threads category/limit/page', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws1', { category: 'cat-1', limit: 10, page: 2 })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('category=cat-1'), 'category threaded')
  t.ok(path.includes('limit=10'), 'limit threaded')
  t.ok(path.includes('page=2'), 'page threaded')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts encodes the workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws/1')
  t.equal(stub.firstCall.args[1], '/storefront/ws%2F1/products', 'encoded workspaceId')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves([])
  try {
    await svc.listStorefrontProducts()
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/workspaceId/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

test('getStorefrontProduct GETs /storefront/:workspaceId/products/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getStorefrontProduct('ws1', 'p/1')
  t.equal(stub.firstCall.args[0], 'getStorefrontProduct', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/products/p%2F1', 'encoded id')
  sandbox.restore()
  t.end()
})

test('getStorefrontProduct throws without id', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.getStorefrontProduct('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/id/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection GETs /storefront/:workspaceId/collections/:collection', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontCollection('ws1', 'nat_categories')
  t.equal(stub.firstCall.args[0], 'listStorefrontCollection', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/collections/nat_categories', 'path')
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection threads limit/page and encodes the collection name', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontCollection('ws1', 'weird name', { limit: 5, page: 2 })
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/storefront/ws1/collections/weird%20name'), 'collection encoded')
  t.ok(path.includes('limit=5') && path.includes('page=2'), 'pagination threaded')
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection throws without collection', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves([])
  try {
    await svc.listStorefrontCollection('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/collection/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// BaseService._requiresInit is the no-auth-header carve-out — every
// storefront method must be registered there (mirrors the meet-guest /
// demo-flow entries) since these are anonymous, unauthenticated reads.
test('BaseService._requiresInit treats all three storefront methods as anonymous (no bearer token attached)', t => {
  t.plan(3)
  const svc = new BaseService()
  t.equal(svc._requiresInit('listStorefrontProducts'), false)
  t.equal(svc._requiresInit('getStorefrontProduct'), false)
  t.equal(svc._requiresInit('listStorefrontCollection'), false)
  t.end()
})

// ── job-application pipeline (tickets/server.md "job-application pipeline
// backend") ────────────────────────────────────────────────────────────────

test('listStorefrontJobs GETs /storefront/:workspaceId/jobs with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontJobs('ws1')
  t.equal(stub.firstCall.args[0], 'listStorefrontJobs', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/jobs', 'no query string')
  sandbox.restore()
  t.end()
})

test('listStorefrontJobs threads limit/page', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontJobs('ws1', { limit: 10, page: 2 })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('limit=10'), 'limit threaded')
  t.ok(path.includes('page=2'), 'page threaded')
  sandbox.restore()
  t.end()
})

test('getStorefrontJob GETs /storefront/:workspaceId/jobs/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getStorefrontJob('ws1', 'op/1')
  t.equal(stub.firstCall.args[0], 'getStorefrontJob', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/jobs/op%2F1', 'encoded id')
  sandbox.restore()
  t.end()
})

test('getStorefrontJob throws without id', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.getStorefrontJob('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/id/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

test('applyToStorefrontJob POSTs /storefront/:workspaceId/jobs/:id/apply with the application payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ received: true })
  await svc.applyToStorefrontJob('ws1', 'op1', {
    fullName: 'Nino Beridze',
    email: 'nino@example.com',
    cvUrl: 'https://cv.example.com/nino.pdf'
  })
  t.equal(stub.firstCall.args[0], 'applyToStorefrontJob')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/jobs/op1/apply')
  t.equal(stub.firstCall.args[2].method, 'POST')
  sandbox.restore()
  t.end()
})

test('applyToStorefrontJob throws without workspaceId or id', async t => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.applyToStorefrontJob(undefined, 'op1', { fullName: 'x', email: 'x@x.com' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/workspaceId/.test(err.message))
  }
  try {
    await svc.applyToStorefrontJob('ws1', undefined, { fullName: 'x', email: 'x@x.com' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/id/.test(err.message))
  }
  sandbox.restore()
  t.end()
})

test('BaseService._requiresInit treats all three job-pipeline methods as anonymous (no bearer token attached)', t => {
  t.plan(3)
  const svc = new BaseService()
  t.equal(svc._requiresInit('listStorefrontJobs'), false)
  t.equal(svc._requiresInit('getStorefrontJob'), false)
  t.equal(svc._requiresInit('applyToStorefrontJob'), false)
  t.end()
})

// ── storefront customer identity (tickets/server.md "storefront customer
// identity layer", NAT-V1-25/27/28) ─────────────────────────────────────

test('registerStorefrontCustomer POSTs /storefront/:workspaceId/auth/register with the full payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.registerStorefrontCustomer('ws1', {
    phone: '+995500000001',
    fullName: 'Nino',
    password: 'Str0ng!Pass'
  })
  t.equal(stub.firstCall.args[0], 'registerStorefrontCustomer')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/register')
  t.equal(stub.firstCall.args[2].method, 'POST')
  sandbox.restore()
  t.end()
})

test('loginStorefrontCustomer POSTs /storefront/:workspaceId/auth/login', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ token: 't', customer: {} })
  await svc.loginStorefrontCustomer('ws1', { phone: '+995500000001', password: 'x' })
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/login')
  t.equal(stub.firstCall.args[2].method, 'POST')
  sandbox.restore()
  t.end()
})

test('requestStorefrontCustomerOtp POSTs /storefront/:workspaceId/auth/request-otp', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.requestStorefrontCustomerOtp('ws1', { email: 'a@b.com', purpose: 'reset' })
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/request-otp')
  sandbox.restore()
  t.end()
})

test('verifyStorefrontCustomerOtp POSTs /storefront/:workspaceId/auth/verify-otp', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.verifyStorefrontCustomerOtp('ws1', { email: 'a@b.com', code: '123456' })
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/verify-otp')
  sandbox.restore()
  t.end()
})

test('resetStorefrontCustomerPassword POSTs /storefront/:workspaceId/auth/reset-password', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.resetStorefrontCustomerPassword('ws1', { email: 'a@b.com', code: '123456', newPassword: 'N3w!Pass' })
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/reset-password')
  sandbox.restore()
  t.end()
})

test('getStorefrontCustomerMe GETs /storefront/:workspaceId/auth/me with an explicit Authorization header (never the TokenManager session)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getStorefrontCustomerMe('ws1', 'customer-jwt')
  t.equal(stub.firstCall.args[0], 'getStorefrontCustomerMe')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/me')
  t.equal(stub.firstCall.args[2].headers.Authorization, 'Bearer customer-jwt')
  sandbox.restore()
  t.end()
})

test('getStorefrontCustomerMe throws without a customerToken', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.getStorefrontCustomerMe('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/customerToken/.test(err.message))
  }
  sandbox.restore()
  t.end()
})

test('BaseService._requiresInit treats all six storefront-customer methods as anonymous/self-authenticated (never the shared TokenManager session)', t => {
  t.plan(6)
  const svc = new BaseService()
  t.equal(svc._requiresInit('registerStorefrontCustomer'), false)
  t.equal(svc._requiresInit('loginStorefrontCustomer'), false)
  t.equal(svc._requiresInit('requestStorefrontCustomerOtp'), false)
  t.equal(svc._requiresInit('verifyStorefrontCustomerOtp'), false)
  t.equal(svc._requiresInit('resetStorefrontCustomerPassword'), false)
  t.equal(svc._requiresInit('getStorefrontCustomerMe'), false)
  t.end()
})

// ── storefront customer SOCIAL sign-in (Google / Apple / Facebook) ────────

test('getStorefrontAuthProviders GETs /storefront/:workspaceId/auth/providers', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ providers: {} })
  await svc.getStorefrontAuthProviders('ws1')
  t.equal(stub.firstCall.args[0], 'getStorefrontAuthProviders')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/providers')
  sandbox.restore()
  t.end()
})

test('signInStorefrontCustomerWithOAuth POSTs the provider token to /auth/oauth/:provider', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ token: 't', customer: {} })
  await svc.signInStorefrontCustomerWithOAuth('ws1', 'apple', {
    idToken: 'id.jwt',
    nonce: 'raw-nonce',
    name: { firstName: 'Ana' }
  })
  t.equal(stub.firstCall.args[0], 'signInStorefrontCustomerWithOAuth')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/auth/oauth/apple')
  t.equal(stub.firstCall.args[2].method, 'POST')
  t.deepEqual(stub.firstCall.args[2].body, {
    idToken: 'id.jwt',
    accessToken: undefined,
    nonce: 'raw-nonce',
    name: { firstName: 'Ana' }
  })
  sandbox.restore()
  t.end()
})

test('signInStorefrontCustomerWithOAuth refuses an unknown provider before any request', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.signInStorefrontCustomerWithOAuth('ws1', 'github', { accessToken: 'x' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/provider/.test(err.message))
  }
  t.equal(stub.callCount, 0)
  sandbox.restore()
  t.end()
})

test('setStorefrontAuthProviders PUTs the owner config to /settings/auth-providers', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const config = { google: { clientIds: ['1-a.apps.googleusercontent.com'] } }
  await svc.setStorefrontAuthProviders('ws1', config)
  t.equal(stub.firstCall.args[1], '/storefront/ws1/settings/auth-providers')
  t.equal(stub.firstCall.args[2].method, 'PUT')
  t.deepEqual(stub.firstCall.args[2].body, config)
  sandbox.restore()
  t.end()
})

test('BaseService._requiresInit: social sign-in is anonymous; the owner config write is NOT', t => {
  t.plan(3)
  const svc = new BaseService()
  t.equal(svc._requiresInit('getStorefrontAuthProviders'), false)
  t.equal(svc._requiresInit('signInStorefrontCustomerWithOAuth'), false)
  t.equal(svc._requiresInit('setStorefrontAuthProviders'), true, 'rides the platform-user session')
  t.end()
})

// ── storefront schema selection (owner|admin) ─────────────────────────────

test('getStorefrontSchema / setStorefrontSchema hit /settings/schema on the platform session', async t => {
  t.plan(6)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getStorefrontSchema('ws1')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/settings/schema')
  t.equal(stub.firstCall.args[2].method, 'GET')
  await svc.setStorefrontSchema('ws1', { preset: 'natali' })
  t.equal(stub.secondCall.args[2].method, 'PUT')
  t.deepEqual(stub.secondCall.args[2].body, { preset: 'natali' })
  const base = new BaseService()
  t.equal(base._requiresInit('getStorefrontSchema'), true)
  t.equal(base._requiresInit('setStorefrontSchema'), true)
  sandbox.restore()
  t.end()
})
