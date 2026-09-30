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

// ── leads.subscribe — the live change stream (GET /core/leads/stream, SSE) ──
// A lead is a server entity, not a records collection, so records.subscribe
// never covered it: a new lead reached the CRM Leads board only after a
// reload. leads.subscribe relays the server's thin events — a REFERENCE per
// change ({ id, action, at }), never row data; the consumer re-reads through
// get / list, where visibility and field rules live.

test('leads.subscribe opens /leads/stream with a flat workspaceId and the two lead events', t => {
  const svc = makeService()
  const unsub = sandbox.stub()
  const sse = sandbox.stub(svc, '_sseSubscribe').returns(unsub)
  const received = []
  const off = svc.subscribe({ workspaceId: 'ws1' }, (e) => received.push(e))

  t.equal(sse.callCount, 1)
  const [path, filter, onEvent, opts] = sse.firstCall.args
  t.equal(path, '/leads/stream', 'a literal path (the route-drift analyzer reads it)')
  t.deepEqual(filter, { workspaceId: 'ws1' }, 'the workspace rides the query — it also binds the stream ticket')
  t.equal(opts.flatParams, true, 'flat ?workspaceId=, the shape requireWorkspaceMember resolves')
  t.deepEqual(opts.events.map((e) => e.name), ['leads.open', 'leads.change'])

  // Framing: the SSE `data` is spread under the event's type.
  const frame = (name, data) => opts.events.find((e) => e.name === name).frame(data, name)
  t.deepEqual(frame('leads.open', { at: 'T0' }), { type: 'leads.open', at: 'T0' })
  t.deepEqual(
    frame('leads.change', { id: 'l1', action: 'create', at: 'T1' }),
    { type: 'leads.change', id: 'l1', action: 'create', at: 'T1' }
  )

  onEvent({ type: 'leads.change', id: 'l1', action: 'create', at: 'T1' })
  t.deepEqual(received, [{ type: 'leads.change', id: 'l1', action: 'create', at: 'T1' }])

  off()
  t.equal(unsub.callCount, 1, 'the returned function closes the stream')
  onEvent({ type: 'leads.change', id: 'l2', action: 'update', at: 'T2' })
  t.equal(received.length, 1, 'nothing is delivered after unsubscribe')
  sandbox.restore()
  t.end()
})

test('leads.subscribe falls back to the active workspace; a throwing listener never breaks the stream', t => {
  const svc = makeService()
  svc._context = { activeWorkspaceId: 'ws-active' }
  const sse = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  svc.subscribe({}, () => { throw new Error('listener bug') })
  t.deepEqual(sse.firstCall.args[1], { workspaceId: 'ws-active' })
  t.doesNotThrow(() => sse.firstCall.args[2]({ type: 'leads.open' }))
  t.throws(() => svc.subscribe({}, null), /onEvent/, 'a missing listener is refused up front')
  sandbox.restore()
  t.end()
})

test("sdk.execute('leads', 'subscribe', { workspaceId }, cb) reaches leads.subscribe(filter, cb)", async t => {
  const calls = []
  const off = () => {}
  const leads = { subscribe: (...a) => { calls.push(a); return off } }
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'leads' ? leads : null) })
  const cb = () => {}
  const r = await dispatch('leads', 'subscribe', { workspaceId: 'ws1' }, cb)
  t.deepEqual(calls[0][0], { workspaceId: 'ws1' })
  t.equal(calls[0][1], cb, 'the dispatcher appends the callback')
  t.equal(r, off, 'the unsubscribe function comes back')
  t.end()
})
