import test from 'tape'
import sinon from 'sinon'
import { CrmService } from '../../CrmService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new CrmService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('crm.getSettings GETs /crm/settings (workspaceId as a query param)', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ visibility: { lead: 'all', deal: 'all' } })
  const r = await svc.getSettings({ workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[0], 'crm.getSettings')
  t.equal(stub.firstCall.args[1], '/crm/settings?workspaceId=ws1')
  t.deepEqual(r.visibility, { lead: 'all', deal: 'all' })
  sandbox.restore()
  t.end()
})

test('crm.updateSettings PATCHes the patch body', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.updateSettings({ visibility: { deal: 'own' } })
  t.equal(stub.firstCall.args[1], '/crm/settings')
  t.deepEqual(stub.firstCall.args[2], { method: 'PATCH', body: { visibility: { deal: 'own' } } })
  sandbox.restore()
  t.end()
})

test("sdk.execute('crm.settings', 'update', { visibility, workspaceId })", async t => {
  const calls = []
  const crm = {
    getSettings: (...a) => { calls.push(['get', a]); return {} },
    updateSettings: (...a) => { calls.push(['update', a]); return {} }
  }
  const dispatch = createEntityDispatcher({ getService: (n) => (n === 'crm' ? crm : null) })
  await dispatch('crm.settings', 'get', { workspaceId: 'ws1' })
  t.deepEqual(calls[0][1], [{ workspaceId: 'ws1' }])
  await dispatch('crm.settings', 'update', { visibility: { lead: 'own' }, workspaceId: 'ws1' })
  t.deepEqual(calls[1][1][0], { visibility: { lead: 'own' } }, 'workspaceId stripped from the body')
  t.deepEqual(calls[1][1][1], { workspaceId: 'ws1' })
  t.end()
})

test('crm.permissions GETs /crm/permissions; dispatcher crm.permissions list', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.permissions({ workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[0], 'crm.permissions')
  t.equal(stub.firstCall.args[1], '/crm/permissions?workspaceId=ws1')
  sandbox.restore()
  const calls = []
  const dispatch = createEntityDispatcher({
    getService: (n) => (n === 'crm' ? { permissions: (...a) => { calls.push(a); return [] } } : null)
  })
  await dispatch('crm.permissions', 'list', { workspaceId: 'ws1' })
  t.deepEqual(calls[0], [{ workspaceId: 'ws1' }])
  t.end()
})

test('crm.migrateCrmDeals POSTs /crm/migrations/crm-deals — dry run unless apply is exactly true', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.migrateCrmDeals()
  t.equal(stub.getCall(0).args[1], '/crm/migrations/crm-deals')
  t.deepEqual(stub.getCall(0).args[2], { method: 'POST', body: { apply: false } })
  await svc.migrateCrmDeals({ apply: true }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[1], '/crm/migrations/crm-deals?workspaceId=ws1')
  t.deepEqual(stub.getCall(1).args[2].body, { apply: true })
  await svc.migrateCrmDeals({ apply: 'yes' })
  t.deepEqual(stub.getCall(2).args[2].body, { apply: false }, 'only a literal true applies')
  sandbox.restore()
  t.end()
})
