import test from 'tape'
import sinon from 'sinon'
import { CreditsService } from '../../CreditsService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new CreditsService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getRates -------------------------------------------------------------------

test('getRates hits /credits/rates with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { retailPricePerCreditUsd: 0.01, tiers: {} }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getRates()
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/credits/rates', 'URL is literal /credits/rates')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

// getProjectBalance ----------------------------------------------------------

test('getProjectBalance hits /projects/:id/credits/balance', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { available: 500, reserved: 20, tier: 'pro' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getProjectBalance('p1')
  t.equal(requestStub.firstCall.args[0], '/projects/p1/credits/balance', 'URL matches')
  t.deepEqual(result, payload, 'returns data envelope')
  sandbox.restore()
  t.end()
})

test('getProjectBalance throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getProjectBalance() } catch (err) {
    t.equal(err.message, 'projectId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// getProjectLedger -----------------------------------------------------------

test('getProjectLedger — no options hits /projects/:id/credits/ledger (literal)', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [] } })
  await svc.getProjectLedger('p1')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/p1/credits/ledger',
    'URL is bare literal when no options'
  )
  sandbox.restore()
  t.end()
})

test('getProjectLedger — with options appends query', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [] } })
  await svc.getProjectLedger('p1', { limit: 50, cursor: 'abc', reason: 'manual.grant' })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/p1/credits/ledger?limit=50&cursor=abc&reason=manual.grant',
    'URL has all query params'
  )
  sandbox.restore()
  t.end()
})

test('getProjectLedger fails-soft to { items: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.getProjectLedger('p1')
  t.deepEqual(result, { items: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

// getProjectSpendControls ----------------------------------------------------

test('getProjectSpendControls hits /projects/:id/credits/controls with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { hardCap: 1000, alerts: { threshold: 0.8 } }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getProjectSpendControls('p1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/p1/credits/controls', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

// updateProjectSpendControls -------------------------------------------------

test('updateProjectSpendControls PUTs controls to /projects/:id/credits/controls', async t => {
  t.plan(3)
  const svc = makeService()
  const controls = { hardCap: 2000, autoRecharge: { enabled: true, amount: 10 } }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: controls })
  await svc.updateProjectSpendControls('p1', controls)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/p1/credits/controls', 'URL matches')
  t.equal(opts.method, 'PUT', 'method PUT')
  t.equal(opts.body, JSON.stringify(controls), 'body carries controls')
  sandbox.restore()
  t.end()
})

test('updateProjectSpendControls throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.updateProjectSpendControls('', { hardCap: 100 }) } catch (err) {
    t.equal(err.message, 'projectId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// topupProjectCredits --------------------------------------------------------

test('topupProjectCredits POSTs packs to /projects/:id/credits/topup', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { checkoutUrl: 'https://…', sessionId: 'cs_123' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  await svc.topupProjectCredits('p1', { packs: 3, returnUrl: 'https://app.co/done' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/p1/credits/topup', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(
    opts.body,
    JSON.stringify({ packs: 3, returnUrl: 'https://app.co/done' }),
    'body carries packs + returnUrl'
  )
  sandbox.restore()
  t.end()
})

test('topupProjectCredits — no args defaults packs=1, omits returnUrl', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.topupProjectCredits('p1')
  t.equal(
    requestStub.firstCall.args[1].body,
    JSON.stringify({ packs: 1 }),
    'defaults packs=1; returnUrl omitted when not passed'
  )
  sandbox.restore()
  t.end()
})

test('topupProjectCredits throws on non-success response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'stripe_error' })
  try {
    await svc.topupProjectCredits('p1')
  } catch (err) {
    t.equal(err.message, 'stripe_error', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
