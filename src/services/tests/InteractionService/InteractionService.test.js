import test from 'tape'
import sinon from 'sinon'
import { InteractionService } from '../../InteractionService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new InteractionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('interactions.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'interactions.list', 'name')
  t.equal(stub.firstCall.args[1], '/interactions', 'no query string')
  sandbox.restore()
  t.end()
})

test('interactions.list threads partyId/kind/regardingType/regardingId/since', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({
    partyId: 'p1',
    kind: 'call',
    regardingType: 'ticket',
    regardingId: 't1',
    since: '2026-01-01'
  })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  t.ok(path.includes('kind=call'), 'kind threaded')
  t.ok(path.includes('regardingType=ticket'), 'regardingType threaded')
  t.ok(path.includes('regardingId=t1'), 'regardingId threaded')
  t.ok(path.includes('since=2026-01-01'), 'since threaded')
  sandbox.restore()
  t.end()
})

test('interactions.get GETs /interactions/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('i/1')
  t.equal(stub.firstCall.args[0], 'interactions.get', 'name')
  t.equal(stub.firstCall.args[1], '/interactions/i%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('interactions.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { partyId: 'p1', kind: 'note', body: 'Followed up' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/interactions', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('interactions.update PATCHes /interactions/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('i1', { summary: 'Edited' })
  t.equal(stub.firstCall.args[1], '/interactions/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { summary: 'Edited' }, 'body')
  sandbox.restore()
  t.end()
})

test('interactions.remove DELETEs /interactions/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('i1')
  t.equal(stub.firstCall.args[1], '/interactions/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('interactions reads + writes thread workspaceId as a query param', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ partyId: 'p1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws alongside filter')
  await svc.create({ partyId: 'p1', kind: 'note' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('i1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})

// ─── CRM 1.4 — activities ────────────────────────────────────────────────────

test('interactions.list threads the activity filters; unpaged stays on _call', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list(
    { status: ['planned', 'done'], owner: 'me', dueFrom: '2026-09-28T00:00:00Z', followUpTo: '2026-10-01' },
    { sort: 'dueAt.asc' }
  )
  const url = stub.firstCall.args[1]
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.equal(q.get('status'), 'planned,done')
  t.equal(q.get('owner'), 'me')
  t.equal(q.get('dueFrom'), '2026-09-28T00:00:00Z')
  t.equal(q.get('followUpTo'), '2026-10-01')
  t.equal(q.get('sort'), 'dueAt.asc')
  t.equal(q.get('limit'), null, 'no paging args → unpaged')
  sandbox.restore()
  t.end()
})

test('interactions.list paged → _request + pagination attached onto the array', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'i1' }],
    pagination: { totalCount: 7, hasMore: true }
  })
  const rows = await svc.list({ status: 'planned' }, { limit: 1, page: 1 })
  const url = req.firstCall.args[0]
  t.ok(url.includes('limit=1') && url.includes('page=1'))
  t.ok(Array.isArray(rows))
  t.equal(rows.pagination.totalCount, 7)
  sandbox.restore()
  t.end()
})

test('interactions.myDay GETs /interactions/my-day with date + tz', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ today: [], overdue: [] })
  await svc.myDay({ date: '2026-09-28', tz: 'Asia/Tbilisi', workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[0], 'interactions.myDay')
  const url = stub.firstCall.args[1]
  t.ok(url.startsWith('/interactions/my-day?'))
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.equal(q.get('date'), '2026-09-28')
  t.equal(q.get('tz'), 'Asia/Tbilisi')
  t.equal(q.get('workspaceId'), 'ws1')
  sandbox.restore()
  t.end()
})

test('interactions.markDone PATCHes status done (+ extra)', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.markDone('i1', { outcome: 'interested' })
  t.equal(stub.firstCall.args[1], '/interactions/i1')
  t.deepEqual(stub.firstCall.args[2], { method: 'PATCH', body: { outcome: 'interested', status: 'done' } })
  sandbox.restore()
  t.end()
})

test("sdk.execute('interactions', 'myDay' | 'markDone')", async t => {
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const calls = []
  const interactions = {
    myDay: (...a) => { calls.push(['myDay', a]); return {} },
    markDone: (...a) => { calls.push(['markDone', a]); return {} }
  }
  const dispatch = createEntityDispatcher({ getService: (n) => (n === 'interactions' ? interactions : null) })
  await dispatch('interactions', 'myDay', { tz: 'Asia/Tbilisi', workspaceId: 'ws1' })
  t.deepEqual(calls[0][1], [{ date: undefined, tz: 'Asia/Tbilisi', workspaceId: 'ws1' }])
  await dispatch('interactions', 'markDone', { id: 'i1', outcome: 'ok', workspaceId: 'ws1' })
  t.equal(calls[1][1][0], 'i1')
  t.deepEqual(calls[1][1][1], { outcome: 'ok' }, 'id + workspaceId stripped from the body')
  t.deepEqual(calls[1][1][2], { workspaceId: 'ws1' })
  t.end()
})
