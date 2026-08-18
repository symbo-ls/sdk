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
