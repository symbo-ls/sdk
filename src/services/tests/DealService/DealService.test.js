import test from 'tape'
import sinon from 'sinon'
import { DealService } from '../../DealService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new DealService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('deals.list GETs /deals with server-side filters, dimensions and paging', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'd1' }],
    pagination: { page: 1, limit: 2, offset: 0, totalCount: 3, pages: 2, hasMore: true }
  })
  const rows = await svc.list(
    {
      pipeline: 'p1',
      stage: ['lead', 'proposal'],
      status: 'open',
      owner: 'me',
      q: 'vake',
      dimensions: { project: 'vake-tower' },
      valueMin: 1000,
      workspaceId: 'ws1'
    },
    { limit: 2, sort: 'value.desc' }
  )
  const url = req.firstCall.args[0]
  t.ok(url.startsWith('/deals?'), 'path')
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.equal(q.get('pipeline'), 'p1')
  t.equal(q.get('stage'), 'lead,proposal', 'arrays join with commas')
  t.equal(q.get('status'), 'open')
  t.equal(q.get('owner'), 'me')
  t.equal(q.get('q'), 'vake')
  t.equal(q.get('dimension.project'), 'vake-tower', 'dimensions → dimension.<key>')
  t.equal(q.get('valueMin'), '1000')
  t.equal(q.get('limit'), '2')
  t.equal(q.get('sort'), 'value.desc')
  t.equal(q.get('workspaceId'), 'ws1')
  t.equal(req.firstCall.args[1].methodName, 'deals.list')
  t.ok(Array.isArray(rows), 'returns an array')
  t.deepEqual(rows.map(r => r.id), ['d1'])
  t.equal(rows.pagination.totalCount, 3, 'pagination attached onto the array')
  t.equal(rows.pagination.hasMore, true)
  sandbox.restore()
  t.end()
})

test('deals.list throws the server message on a refusal', async t => {
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'limit must be at most 200' })
  try {
    await svc.list({}, { limit: 500 })
    t.fail('should throw')
  } catch (e) {
    t.equal(e.message, 'limit must be at most 200')
  }
  sandbox.restore()
  t.end()
})

test('deals.summary / pipelines / get / create / update / remove paths', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.summary({ pipeline: 'p1' })
  t.equal(stub.getCall(0).args[1], '/deals/summary?pipeline=p1')
  await svc.pipelines({ workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[1], '/deals/pipelines?workspaceId=ws1')
  await svc.get('d/1')
  t.equal(stub.getCall(2).args[1], '/deals/d%2F1', 'id encoded, no query without workspaceId')
  await svc.create({ title: 'Vake' }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(3).args[1], '/deals?workspaceId=ws1')
  t.equal(stub.getCall(3).args[2].method, 'POST')
  t.deepEqual(stub.getCall(3).args[2].body, { title: 'Vake' })
  await svc.update('d1', { title: 'x' })
  t.equal(stub.getCall(4).args[2].method, 'PATCH')
  await svc.remove('d1')
  t.equal(stub.getCall(5).args[1], '/deals/d1')
  t.equal(stub.getCall(5).args[2].method, 'DELETE')
  sandbox.restore()
  t.end()
})

test('deals lifecycle helpers: move / markWon / markLost / reopen', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.move('d1', { stage: 'proposal', stageOrder: 1.5 })
  t.deepEqual(stub.getCall(0).args[2], { method: 'PATCH', body: { stage: 'proposal', stageOrder: 1.5 } })
  await svc.markWon('d1')
  t.deepEqual(stub.getCall(1).args[2].body, { status: 'won' })
  await svc.markLost('d1', { key: 'price', note: 'too high' })
  t.deepEqual(stub.getCall(2).args[2].body, { status: 'lost', lossReason: { key: 'price', note: 'too high' } })
  await svc.reopen('d1', { stage: 'qualified' })
  t.equal(stub.getCall(3).args[1], '/deals/d1/reopen')
  t.deepEqual(stub.getCall(3).args[2], { method: 'POST', body: { stage: 'qualified' } })
  sandbox.restore()
  t.end()
})

test("sdk.execute('deals', ...) routes through the dispatcher with workspace threading", async t => {
  const calls = []
  const deals = {
    list: (...a) => { calls.push(['list', a]); return [] },
    move: (...a) => { calls.push(['move', a]); return {} },
    markLost: (...a) => { calls.push(['markLost', a]); return {} },
    create: (...a) => { calls.push(['create', a]); return {} }
  }
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'deals' ? deals : null) })
  await dispatch('deals', 'list', { status: 'open', workspaceId: 'ws1', limit: 10 })
  t.deepEqual(calls[0][1][0], { status: 'open', workspaceId: 'ws1' }, 'flat filter fields')
  t.equal(calls[0][1][1].limit, 10)
  t.equal(calls[0][1][1].workspaceId, 'ws1')
  await dispatch('deals', 'move', { id: 'd1', stage: 'won', workspaceId: 'ws1' })
  t.equal(calls[1][1][0], 'd1')
  t.equal(calls[1][1][1].stage, 'won')
  t.deepEqual(calls[1][1][2], { workspaceId: 'ws1' })
  await dispatch('deals', 'markLost', { id: 'd1', lossReason: { note: 'x' } })
  t.deepEqual(calls[2][1][1], { note: 'x' })
  await dispatch('deals', 'create', { title: 'T', workspaceId: 'ws1' })
  t.deepEqual(calls[3][1][0], { title: 'T' }, 'workspaceId stripped from the body')
  t.deepEqual(calls[3][1][1], { workspaceId: 'ws1' })
  t.end()
})
