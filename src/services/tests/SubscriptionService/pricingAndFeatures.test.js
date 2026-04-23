import test from 'tape'
import sinon from 'sinon'
import { SubscriptionService } from '../../SubscriptionService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new SubscriptionService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// listInvoices (drift-inline regression) -------------------------------------

test('listInvoices — no options appends default page + limit', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { invoices: [] } })
  await svc.listInvoices('sub1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/subscriptions/sub1/invoices?page=1&limit=20',
    'URL has default page=1 + limit=20 appended'
  )
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('listInvoices — zero page + zero limit hits literal /subscriptions/:id/invoices', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.listInvoices('sub1', { page: 0, limit: 0 })
  t.equal(
    requestStub.firstCall.args[0],
    '/subscriptions/sub1/invoices',
    'zero-valued defaults skip query append; URL is bare literal'
  )
  sandbox.restore()
  t.end()
})

test('listInvoices — with options appends query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.listInvoices('sub1', { page: 2, limit: 50, status: 'paid', startingAfter: 'inv1' })
  t.equal(
    requestStub.firstCall.args[0],
    '/subscriptions/sub1/invoices?page=2&limit=50&status=paid&startingAfter=inv1',
    'URL has all query params'
  )
  sandbox.restore()
  t.end()
})

// getPortalUrl (drift-inline regression) -------------------------------------

test('getPortalUrl — no returnUrl hits /subscriptions/:id/portal (literal)', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { url: 'https://…' } })
  await svc.getPortalUrl('sub1')
  t.equal(requestStub.firstCall.args[0], '/subscriptions/sub1/portal', 'URL is literal')
  sandbox.restore()
  t.end()
})

test('getPortalUrl — with returnUrl appends query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.getPortalUrl('sub1', 'https://app.example.co/billing')
  t.equal(
    requestStub.firstCall.args[0],
    '/subscriptions/sub1/portal?returnUrl=https%3A%2F%2Fapp.example.co%2Fbilling',
    'returnUrl is encoded'
  )
  sandbox.restore()
  t.end()
})

// getPricingOptions ----------------------------------------------------------

test('getPricingOptions hits /subscriptions/:id/pricing-options', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { plans: [] } })
  await svc.getPricingOptions('sub1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/subscriptions/sub1/pricing-options', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getPricingOptions throws without subscriptionId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getPricingOptions('') } catch (err) {
    t.equal(err.message, 'subscriptionId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// canAccessProjectFeature ----------------------------------------------------

test('canAccessProjectFeature hits /subscriptions/project/:id/features/:key/can-access', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { canAccess: true, source: 'plan' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.canAccessProjectFeature('p1', 'advanced-export')
  t.equal(
    requestStub.firstCall.args[0],
    '/subscriptions/project/p1/features/advanced-export/can-access',
    'URL matches'
  )
  t.deepEqual(result, payload, 'returns data envelope')
  sandbox.restore()
  t.end()
})

test('canAccessProjectFeature url-encodes featureKey', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.canAccessProjectFeature('p1', 'feature/with spaces')
  t.equal(
    requestStub.firstCall.args[0],
    '/subscriptions/project/p1/features/feature%2Fwith%20spaces/can-access',
    'featureKey is percent-encoded'
  )
  sandbox.restore()
  t.end()
})

test('canAccessProjectFeature fails-soft to { canAccess: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.canAccessProjectFeature('p1', 'x')
  t.deepEqual(result, { canAccess: false }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

// grantProjectFeature --------------------------------------------------------

test('grantProjectFeature POSTs to .../features/:key/grant', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { granted: true } })
  await svc.grantProjectFeature('p1', 'advanced-export')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/subscriptions/project/p1/features/advanced-export/grant', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('grantProjectFeature throws on non-success', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'forbidden' })
  try {
    await svc.grantProjectFeature('p1', 'x')
  } catch (err) {
    t.equal(err.message, 'forbidden', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

test('grantProjectFeature throws without featureKey', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.grantProjectFeature('p1', '') } catch (err) {
    t.equal(err.message, 'featureKey is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// revokeProjectFeature -------------------------------------------------------

test('revokeProjectFeature POSTs to .../features/:key/revoke', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { revoked: true } })
  await svc.revokeProjectFeature('p1', 'advanced-export')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/subscriptions/project/p1/features/advanced-export/revoke', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('revokeProjectFeature throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.revokeProjectFeature(null, 'x') } catch (err) {
    t.equal(err.message, 'projectId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
