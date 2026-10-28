import test from 'tape'
import sinon from 'sinon'
import { CompanyProfileService } from '../../CompanyProfileService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// CompanyProfile is a workspace singleton — GET/PATCH /core/company-profile,
// no /:id, no list/create/remove.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new CompanyProfileService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('companyProfile.get GETs the singleton /company-profile (no id)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get()
  t.equal(stub.firstCall.args[0], 'companyProfile.get', 'name')
  t.equal(stub.firstCall.args[1], '/company-profile', 'singleton path, no id')
  sandbox.restore()
  t.end()
})

test('companyProfile.update PATCHes /company-profile with the payload (upsert)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { legalName: 'Acme Inc', displayName: 'Acme' }
  await svc.update(payload)
  t.equal(stub.firstCall.args[1], '/company-profile', 'singleton path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('companyProfile threads workspaceId as a query param on get + update', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get({ workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.update({ legalName: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'update threads ws')
  sandbox.restore()
  t.end()
})

// The whole chain an app uses — sdk.execute('companyProfile', op, { …,
// workspaceId }) → the dispatcher → this service: the request names the
// workspace (no claim fallback), and the body never carries workspaceId.
test('sdk.execute companyProfile get + update reach the route pinned to the workspace', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const execute = createEntityDispatcher({ getService: () => svc })
  await execute('companyProfile', 'get', { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[1], '/company-profile?workspaceId=ws1', 'get names the workspace')
  await execute('companyProfile', 'update', { baseCurrency: 'GEL', workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[1], '/company-profile?workspaceId=ws1', 'update names the workspace')
  t.deepEqual(stub.getCall(1).args[2].body, { baseCurrency: 'GEL' }, 'the body holds no workspaceId')
  await execute('companyProfile', 'get', {})
  t.equal(stub.getCall(2).args[1], '/company-profile', 'no workspaceId: the old path')
  await execute('companyProfile', 'update', { legalName: 'x' })
  t.equal(stub.getCall(3).args[1], '/company-profile', 'no workspaceId: the old path')
  sandbox.restore()
  t.end()
})
