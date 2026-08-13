import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// Generic records plane (workspace_records data-plane split, tickets/server.md).
// Mongo cutover complete server-side (server 06638f83): every op routes to
// /core/workspaces/:workspaceId/records[...] over the SAME WorkspaceRecord
// rows the agent tools read/write. These tests assert the /core wire shapes
// without a live server, plus the pagination fix (tickets/server.md "records
// plane silently CAPS list at 100 rows, no marker, no total, no warning").

const sandbox = sinon.createSandbox()

const makeService = (workspaceId = 'ws-1') => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  svc._context = { activeWorkspaceId: workspaceId }
  return svc
}

test('records.list GETs /core/workspaces/:id/records with collection/limit/offset/order params', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'r1', collection: 'cms_entries', name: 'Hi', data: {}, created_at: null, updated_at: null }],
    pagination: { page: 1, limit: 10, totalCount: 1, pages: 1, hasMore: false }
  })
  await svc.records.list({ collection: 'cms_entries' }, { limit: 10, offset: 20, order: 'updated_at.desc' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(
    endpoint,
    '/workspaces/ws-1/records?collection=cms_entries&limit=10&offset=20&order=updated_at.desc',
    'query string carries collection/limit/offset/order'
  )
  t.equal(opts.method, 'GET', 'GET')
  t.equal(opts.methodName, 'records.list')
  sandbox.restore()
  t.end()
})

test('records.list forwards `page` (wins server-side over offset — see WorkspaceRecordsController)', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [], pagination: {} })
  await svc.records.list(null, { page: 3 })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws-1/records?page=3')
  sandbox.restore()
  t.end()
})

test('records.list returns a REAL array (Array.isArray) — a live consumer (icca-manage iccaListAll) type-checks this', async (t) => {
  t.plan(3)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'r1' }, { id: 'r2' }],
    pagination: { page: 1, limit: 100, totalCount: 2, pages: 1, hasMore: false }
  })
  const out = await svc.records.list({ collection: 'icca_site_copy' })
  t.equal(Array.isArray(out), true, 'still a real array, not a {data,pagination} wrapper')
  t.equal(out.length, 2)
  t.deepEqual([...out], [{ id: 'r1' }, { id: 'r2' }], 'spread/iteration unaffected')
  sandbox.restore()
  t.end()
})

test('records.list attaches `pagination` onto the array so truncation is now observable', async (t) => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({
    success: true,
    data: new Array(100).fill({ id: 'r' }),
    pagination: { page: 1, limit: 100, totalCount: 113, pages: 2, hasMore: true }
  })
  const out = await svc.records.list({ collection: 'icca_site_copy' }, { limit: 1000 })
  t.equal(out.length, 100, 'still capped at 100 rows on the wire — raising the cap is not the fix')
  t.deepEqual(
    out.pagination,
    { page: 1, limit: 100, totalCount: 113, pages: 2, hasMore: true },
    'the previously-invisible 13-row gap is now readable off the returned array'
  )
  sandbox.restore()
  t.end()
})

test('records.list with no `pagination` in the response (older server) → still a plain array, no crash', async (t) => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true, data: [{ id: 'r1' }] })
  const out = await svc.records.list({ collection: 'cms_entries' })
  t.deepEqual(out, [{ id: 'r1' }])
  t.equal(out.pagination, undefined)
  sandbox.restore()
  t.end()
})

test('records.list throws when neither an explicit workspaceId nor activeWorkspaceId is available', async (t) => {
  t.plan(1)
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  svc._context = {}
  try {
    await svc.records.list({ collection: 'cms_entries' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/no workspace scope/.test(err.message))
  }
  sandbox.restore()
  t.end()
})

test('records.get GETs /records/:id + unwraps { data }', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'r1', name: 'Hi' } })
  const out = await svc.records.get('r1')
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws-1/records/r1')
  t.deepEqual(out, { id: 'r1', name: 'Hi' })
  sandbox.restore()
  t.end()
})

test('records.create POSTs the payload + unwraps { data }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { id: 'r1', collection: 'cms_entries' } })
  const out = await svc.records.create({ collection: 'cms_entries', data: { title: 'x' } })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws-1/records')
  t.equal(opts.method, 'POST')
  t.deepEqual(out, { id: 'r1', collection: 'cms_entries' })
  sandbox.restore()
  t.end()
})

test('records.{update,remove} PATCH/DELETE the id sub-path + unwrap { data }', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request')
  reqStub.onFirstCall().resolves({ success: true, data: { id: 'r1', name: 'y' } })
  reqStub.onSecondCall().resolves({ success: true, data: { id: 'r1' } })
  const upd = await svc.records.update('r1', { name: 'y' })
  await svc.records.remove('r1')
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws-1/records/r1')
  t.equal(reqStub.firstCall.args[1].method, 'PATCH')
  t.deepEqual(upd, { id: 'r1', name: 'y' })
  t.equal(reqStub.secondCall.args[1].method, 'DELETE')
  sandbox.restore()
  t.end()
})

// ═══════════════════════════════════════════════════════════════════════════
// records.subscribe — reconnect backlog
//
// (tickets/opus.md "headless Chrome recycles the records EventSource every
// ~33s, and records has no reconnect backlog to cover the gap", 2026-08-09)
//
// The server's /records/stream sends ONLY `records.open` (bare connection
// marker) and `records.change` (thin action marker, no row data) — no
// snapshot frame at all, unlike /tickets/stream and /docs/stream. Before this
// fix, a `records.change` landing inside a reconnect gap (network blip,
// deploy, sleep/wake, or a browser-driven recycle) was lost silently: no
// error, no retry, no recovery. The fix treats every `records.open` — first
// connect AND every reconnect — as a cue to backfill via the existing REST
// `records.list()` and deliver a synthetic `records.snapshot` event, giving
// records the same "a reconnect always re-syncs full state" guarantee
// tickets/docs get natively from the wire.
// ═══════════════════════════════════════════════════════════════════════════

// Captures the callback records.subscribe wires into _sseSubscribe, plus the
// unsubscribe() _sseSubscribe itself would return, so tests can simulate the
// server pushing framed records.open / records.change events.
const stubSseSubscribe = (svc) => {
  let onEvent = null
  const sseUnsub = sandbox.stub()
  const sseStub = sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, cb, opts) => {
    onEvent = cb
    return sseUnsub
  })
  return {
    sseStub,
    sseUnsub,
    fire: (evt) => onEvent(evt),
    hasListener: () => onEvent !== null
  }
}

// Flush pending microtasks (the backfill is a `.then()` chain off a stubbed
// Promise) without a real timer.
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('records.subscribe forwards records.open unchanged AND triggers a records.snapshot backfill', async (t) => {
  t.plan(5)
  const svc = makeService('ws-1')
  const { fire } = stubSseSubscribe(svc)
  const listStub = sandbox
    .stub(svc.records, 'list')
    .resolves([{ id: 'r1', collection: 'cms_entries', data: { a: 1 } }])

  const received = []
  svc.records.subscribe({ collection: 'cms_entries' }, (evt) => received.push(evt))

  fire({ type: 'records.open', collection: 'cms_entries' })
  await flush()

  t.equal(received.length, 2, 'onEvent fired twice: records.open, then records.snapshot')
  t.deepEqual(received[0], { type: 'records.open', collection: 'cms_entries' }, 'records.open forwarded unchanged')
  t.equal(received[1].type, 'records.snapshot', 'synthetic records.snapshot delivered')
  t.deepEqual(
    received[1].records,
    [{ id: 'r1', collection: 'cms_entries', data: { a: 1 } }],
    'snapshot carries the freshly-listed rows'
  )
  t.deepEqual(
    listStub.firstCall.args,
    [{ collection: 'cms_entries' }, { workspaceId: 'ws-1' }],
    'backfill reuses records.list scoped to the same collection/workspace'
  )
  sandbox.restore()
  t.end()
})

// THE acceptance test: "a write issued during a forced reconnect must still
// land" — a happy-path-only test does not close this ticket, because a
// silent drop is exactly the class that comes back.
test('records.subscribe: a write issued during a forced reconnect still lands (no records.change ever fires for it)', async (t) => {
  t.plan(4)
  const svc = makeService('ws-1')
  const { fire } = stubSseSubscribe(svc)
  const listStub = sandbox.stub(svc.records, 'list')
  // Call 1 = state as of the FIRST connect.
  listStub.onCall(0).resolves([{ id: 'r1', data: { a: 1 } }])
  // Call 2 = state as of the RECONNECT. r2 was written WHILE the connection
  // was down — deliberately no `records.change` event is ever fired for it
  // in this test, simulating the exact loss this ticket describes.
  listStub.onCall(1).resolves([
    { id: 'r1', data: { a: 1 } },
    { id: 'r2', data: { b: 2 } }
  ])

  const received = []
  svc.records.subscribe({ collection: 'cms_entries' }, (evt) => received.push(evt))

  // First connect.
  fire({ type: 'records.open', collection: 'cms_entries' })
  await flush()
  const snapshot1 = received.find((e, i) => e.type === 'records.snapshot' && i === 1)
  t.deepEqual(snapshot1.records.map((r) => r.id), ['r1'], 'pre-reconnect snapshot has only r1')

  // Forced reconnect — the ~33s recycle, a network blip, a deploy, whatever
  // the trigger. NO records.change is fired for r2's write; the only signal
  // the consumer gets is a fresh records.open.
  received.length = 0
  fire({ type: 'records.open', collection: 'cms_entries' })
  await flush()

  t.equal(received.length, 2, 'reconnect produces records.open then records.snapshot again')
  t.equal(received[0].type, 'records.open', 'records.open fires on the reconnect too')
  const snapshot2 = received[1]
  const ids = snapshot2.records.map((r) => r.id)
  t.deepEqual(ids, ['r1', 'r2'], 'r2 — written during the outage, with NO records.change ever delivered — is present in the post-reconnect snapshot')
  sandbox.restore()
  t.end()
})

test('records.subscribe: records.change passes through unchanged and does NOT trigger a backfill', async (t) => {
  t.plan(3)
  const svc = makeService('ws-1')
  const { fire } = stubSseSubscribe(svc)
  const listStub = sandbox.stub(svc.records, 'list').resolves([])

  const received = []
  svc.records.subscribe({ collection: 'cms_entries' }, (evt) => received.push(evt))

  fire({ type: 'records.change', collection: 'cms_entries', action: 'update', at: 123 })
  await flush()

  t.equal(received.length, 1, 'only the change event itself is delivered')
  t.deepEqual(received[0], { type: 'records.change', collection: 'cms_entries', action: 'update', at: 123 })
  t.equal(listStub.called, false, 'no backfill for a plain change event')
  sandbox.restore()
  t.end()
})

test('records.subscribe: unsubscribing before the backfill resolves suppresses delivery (no post-teardown onEvent)', async (t) => {
  t.plan(3)
  const svc = makeService('ws-1')
  const { fire, sseUnsub } = stubSseSubscribe(svc)
  let resolveList
  const listStub = sandbox
    .stub(svc.records, 'list')
    .returns(new Promise((resolve) => { resolveList = resolve }))

  const received = []
  const unsub = svc.records.subscribe({ collection: 'cms_entries' }, (evt) => received.push(evt))

  fire({ type: 'records.open', collection: 'cms_entries' })
  t.equal(received.length, 1, 'records.open delivered synchronously before the backfill resolves')

  unsub()
  resolveList([{ id: 'late' }])
  await flush()

  t.equal(received.length, 1, 'the snapshot that resolved AFTER unsubscribe is never delivered')
  t.equal(sseUnsub.calledOnce, true, 'the underlying _sseSubscribe unsubscribe() is also called')
  sandbox.restore()
  t.end()
})

test('records.subscribe: a stale in-flight backfill is discarded when a newer records.open supersedes it', async (t) => {
  t.plan(2)
  const svc = makeService('ws-1')
  const { fire } = stubSseSubscribe(svc)
  let resolveFirst
  let resolveSecond
  const listStub = sandbox.stub(svc.records, 'list')
  listStub.onCall(0).returns(new Promise((resolve) => { resolveFirst = resolve }))
  listStub.onCall(1).returns(new Promise((resolve) => { resolveSecond = resolve }))

  const received = []
  svc.records.subscribe({ collection: 'cms_entries' }, (evt) => received.push(evt))

  // Two reconnects in rapid succession BEFORE either backfill resolves.
  fire({ type: 'records.open', collection: 'cms_entries' })
  fire({ type: 'records.open', collection: 'cms_entries' })

  // Resolve the SECOND (newer) call first, then the stale first call late —
  // the stale one must still be discarded even though it resolves after.
  resolveSecond([{ id: 'fresh' }])
  await flush()
  resolveFirst([{ id: 'stale' }])
  await flush()

  const snapshots = received.filter((e) => e.type === 'records.snapshot')
  t.equal(snapshots.length, 1, 'only ONE snapshot is ever delivered, not one per backfill call')
  t.deepEqual(snapshots[0].records, [{ id: 'fresh' }], 'the delivered snapshot is the newer (latest-epoch) result, not the stale one')
  sandbox.restore()
  t.end()
})

test('records.subscribe: the workspace id is encoded ONCE for the SSE path and passed RAW to the list() backfill (no double-encoding)', async (t) => {
  t.plan(2)
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  // A workspace id containing a character that DOES change under
  // encodeURIComponent, so a double-encode bug (encoding the already-encoded
  // SSE path segment a second time when handed to list()) would be visible.
  svc._context = { activeWorkspaceId: 'ws 1' }
  const { sseStub } = stubSseSubscribe(svc)
  const listStub = sandbox.stub(svc.records, 'list').resolves([])

  svc.records.subscribe({ collection: 'cms_entries' }, () => {})

  t.equal(sseStub.firstCall.args[0], '/workspaces/ws%201/records/stream', 'SSE path is encoded once')
  // Trigger the backfill and inspect what list() was actually called with.
  const onEvent = sseStub.firstCall.args[2]
  onEvent({ type: 'records.open', collection: 'cms_entries' })
  t.deepEqual(
    listStub.firstCall.args[1],
    { workspaceId: 'ws 1' },
    'list() receives the RAW workspace id — list() itself will encode it once, internally'
  )
  sandbox.restore()
  t.end()
})
