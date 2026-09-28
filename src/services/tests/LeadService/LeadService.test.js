import test from 'tape'
import sinon from 'sinon'
import { LeadService } from '../../LeadService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new LeadService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('leads.list GETs /leads and attaches pagination', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'l1' }],
    pagination: { totalCount: 1, hasMore: false }
  })
  const rows = await svc.list({ sourceChannel: ['meta', 'website'], owner: 'none' }, { page: 2 })
  const url = req.firstCall.args[0]
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.ok(url.startsWith('/leads?'))
  t.equal(q.get('sourceChannel'), 'meta,website')
  t.equal(q.get('owner'), 'none')
  t.equal(q.get('page'), '2')
  t.equal(rows.pagination.totalCount, 1)
  sandbox.restore()
  t.end()
})

test('leads.convert POSTs /leads/:id/convert with the overrides', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ lead: {}, deal: {} })
  await svc.convert('l1', { title: 'Vake 2BR' }, { workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[0], 'leads.convert')
  t.equal(stub.firstCall.args[1], '/leads/l1/convert?workspaceId=ws1')
  t.deepEqual(stub.firstCall.args[2], { method: 'POST', body: { title: 'Vake 2BR' } })
  sandbox.restore()
  t.end()
})

test('leads.markLost / reopen / pipelines paths', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.markLost('l1', { key: 'non_lead' })
  t.deepEqual(stub.getCall(0).args[2].body, { status: 'lost', lossReason: { key: 'non_lead' } })
  await svc.reopen('l1')
  t.deepEqual(stub.getCall(1).args[2], { method: 'POST', body: {} })
  await svc.pipelines()
  t.equal(stub.getCall(2).args[1], '/leads/pipelines')
  sandbox.restore()
  t.end()
})

test("sdk.execute('leads', 'convert', { id, title, workspaceId })", async t => {
  const calls = []
  const leads = { convert: (...a) => { calls.push(a); return {} } }
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'leads' ? leads : null) })
  await dispatch('leads', 'convert', { id: 'l1', title: 'Deal title', workspaceId: 'ws1' })
  t.equal(calls[0][0], 'l1')
  t.deepEqual(calls[0][1], { title: 'Deal title' }, 'id + workspaceId stripped from the body')
  t.deepEqual(calls[0][2], { workspaceId: 'ws1' })
  t.end()
})
