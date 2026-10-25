import test from 'tape'
import sinon from 'sinon'
import { IntegrationService } from '../../IntegrationService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for the public integrations catalogue —
// getIntegrationsCatalog (GET /core/integrations/catalog). The record the
// symbols.app Integrations page renders: public, cached `public, max-age=300`,
// read signed out, so no bearer token. Transport is mocked at `_request`, so
// the `_call` envelope unwrap is exercised too.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new IntegrationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

const CATALOG = {
  version: 1,
  statuses: [{ key: 'live', name: { en: 'Live', ka: 'Live' } }],
  groups: [{ key: 'payments', name: { en: 'Payments', ka: 'Payments' } }],
  integrations: [{ key: 'keepz', name: { en: 'Keepz', ka: 'Keepz' }, group: 'payments', status: 'live', ticket: null }]
}

test('getIntegrationsCatalog is flat-exposed by the SDK', t => {
  t.plan(1)
  t.equal(SERVICE_METHODS.getIntegrationsCatalog, 'integration', 'maps to IntegrationService')
})

test('getIntegrationsCatalog is public (no session header)', t => {
  t.plan(2)
  const svc = makeService()
  t.equal(svc._requiresInit('getIntegrationsCatalog'), false, 'the catalogue read attaches no bearer token')
  t.equal(svc._requiresInit('listOrgIntegrationKinds'), true, 'the kinds read keeps its session')
  sandbox.restore()
})

test('getIntegrationsCatalog GETs /integrations/catalog and returns the unwrapped record', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: CATALOG })

  const result = await svc.getIntegrationsCatalog()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/integrations/catalog', 'URL matches the public catalogue route')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, CATALOG, 'the record, unwrapped from { success, data }')
  sandbox.restore()
  t.end()
})

test('getIntegrationsCatalog throws on a failed answer', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').rejects(new Error('HTTP 503'))
  try {
    await svc.getIntegrationsCatalog()
    t.fail('expected a throw')
  } catch (err) {
    t.ok(/503|getIntegrationsCatalog/.test(err.message), 'the failure surfaces')
  }
  sandbox.restore()
  t.end()
})
