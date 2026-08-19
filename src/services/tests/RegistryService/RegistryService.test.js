import test from 'tape'
import sinon from 'sinon'
import { RegistryService } from '../../RegistryService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new RegistryService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('registry.frStatus GETs the status route', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ mode: 'live' })
  await svc.frStatus()
  t.equal(stub.firstCall.args[0], 'registry.frStatus', 'name')
  t.equal(stub.firstCall.args[1], '/registry/fr/status', 'path')
  sandbox.restore()
  t.end()
})

test('registry.frSearch encodes q and threads limit', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ rows: [] })
  await svc.frSearch('boulangerie dupont', { limit: 5 })
  t.equal(stub.firstCall.args[0], 'registry.frSearch', 'name')
  t.equal(
    stub.firstCall.args[1],
    '/registry/fr/search?q=boulangerie+dupont&limit=5',
    'q encoded, limit threaded'
  )
  sandbox.restore()
  t.end()
})

test('registry.frSearch omits limit when not given', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ rows: [] })
  await svc.frSearch('acme')
  t.equal(stub.firstCall.args[1], '/registry/fr/search?q=acme', 'no limit param')
  sandbox.restore()
  t.end()
})

test('registry.frCompany GETs /registry/fr/company/:siren encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ company: {} })
  await svc.frCompany('794598813')
  t.equal(stub.firstCall.args[0], 'registry.frCompany', 'name')
  t.equal(stub.firstCall.args[1], '/registry/fr/company/794598813', 'path')
  sandbox.restore()
  t.end()
})

// Envelope unwrap — through the REAL _call against a stubbed _request, so the
// consumer contract (the DATA payload, never the { success, data } envelope —
// workspace moduleRegistryBridge.js) stays pinned.

test('registry.frSearch resolves the data payload, not the envelope', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { rows: [{ siren: '794598813', name: 'ACME' }], provider: 'gouv', cached: true }
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.frSearch('acme')
  t.deepEqual(result, payload, '{ rows, provider, cached } unwrapped')
  t.equal(stub.firstCall.args[1].method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('registry.frCompany resolves the data payload, not the envelope', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = { company: { siren: '794598813', name: 'ACME' }, provider: 'gouv' }
  sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.frCompany('794598813')
  t.deepEqual(result, payload, '{ company, provider } unwrapped')
  sandbox.restore()
  t.end()
})

test('registry.frStatus resolves the data payload, not the envelope', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = { mode: 'live', providers: { gouv: true, pappers: false, insee: false } }
  sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.frStatus()
  t.deepEqual(result, payload, '{ mode, providers } unwrapped')
  sandbox.restore()
  t.end()
})

test('registry.frSearch throws the server message on a non-success envelope', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'registry search failed' })
  try {
    await svc.frSearch('acme')
  } catch (err) {
    t.equal(err.message, 'registry search failed', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})
