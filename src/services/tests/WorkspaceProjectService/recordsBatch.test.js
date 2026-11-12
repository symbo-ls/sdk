import test from 'tape'
import sinon from 'sinon'
import {
  WorkspaceProjectService,
  RECORDS_BATCH_MAX,
  RECORDS_BATCH_MAX_CHARS
} from '../../WorkspaceProjectService.js'

// records.listBatch + the opt-in read coalescer (perf report 2026-11-12: one
// signed-in home load sent 24 GET /core/workspaces/:id/records). Server half:
// WorkspaceRecordsController.batchList — GET /records/batch?items=<JSON>,
// answering `{ success, data: [{ status, body }] }` where each body is
// verbatim what GET /records answers for that item.

const sandbox = sinon.createSandbox()

const makeService = ({ options = {}, workspaceId = 'ws-1' } = {}) => {
  const svc = new WorkspaceProjectService({ options })
  sandbox.stub(svc, '_requireReady').resolves()
  svc._context = { activeWorkspaceId: workspaceId }
  return svc
}

const rowsBody = (col, n = 1) => ({
  success: true,
  data: Array.from({ length: n }, (_, i) => ({ id: `${col}-${i}`, collection: col })),
  pagination: { page: 1, limit: 100, totalCount: n, pages: 1, hasMore: false }
})

const itemsOf = (endpoint) =>
  JSON.parse(decodeURIComponent(endpoint.split('?items=')[1]))

test('records.listBatch GETs /records/batch with the list() queries as string-valued items', async (t) => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ status: 200, body: rowsBody('a') }, { status: 403, body: { error: 'forbidden_collection_not_granted' } }]
  })
  const out = await svc.records.listBatch([
    { filter: { collection: 'a' }, options: { limit: 10, order: 'updated_at.desc' } },
    { filter: { collection: 'b' }, options: { page: 2 } }
  ])
  const [endpoint, opts] = req.firstCall.args
  t.ok(endpoint.startsWith('/workspaces/ws-1/records/batch?items='), 'batch path, literal at the call site')
  t.deepEqual(itemsOf(endpoint), [
    { collection: 'a', limit: '10', order: 'updated_at.desc' },
    { collection: 'b', page: '2' }
  ], 'items carry exactly the single route params, as strings')
  t.equal(opts.method, 'GET')
  t.equal(opts.methodName, 'records.listBatch')
  t.equal(out.length, 2, 'slots returned verbatim')
  t.equal(out[1].status, 403, 'a failed item is a slot, never a throw')
  sandbox.restore()
  t.end()
})

test('records.listBatch refuses an empty batch and one over the server cap', async (t) => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  try {
    await svc.records.listBatch([])
    t.fail('empty batch must throw')
  } catch (e) {
    t.ok(/at least one query/.test(e.message))
  }
  try {
    await svc.records.listBatch(new Array(RECORDS_BATCH_MAX + 1).fill({ filter: { collection: 'a' } }))
    t.fail('over-cap batch must throw')
  } catch (e) {
    t.ok(/at most 25/.test(e.message))
  }
  t.equal(req.called, false, 'nothing sent')
  sandbox.restore()
  t.end()
})

test('list() without the option: one GET /records per call, query string unchanged', async (t) => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').callsFake(async () => rowsBody('a'))
  await Promise.all([
    svc.records.list({ collection: 'a' }, { limit: 10, offset: 20, order: 'updated_at.desc' }),
    svc.records.list({ collection: 'b' })
  ])
  t.equal(req.callCount, 2, 'no coalescing by default')
  t.equal(
    req.firstCall.args[0],
    '/workspaces/ws-1/records?collection=a&limit=10&offset=20&order=updated_at.desc',
    'byte-identical query string'
  )
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: same-window list() calls share ONE batch; each caller gets its own list() answer', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) => {
    const items = itemsOf(endpoint)
    return {
      success: true,
      data: items.map((it) =>
        it.collection === 'denied'
          ? { status: 403, body: { error: 'forbidden_collection_not_granted', message: 'no grant' } }
          : { status: 200, body: rowsBody(it.collection, 2) }
      )
    }
  })
  const results = await Promise.allSettled([
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'b' }, { limit: 5 }),
    svc.records.list({ collection: 'denied' })
  ])
  t.equal(req.callCount, 1, 'three reads, one request')
  t.ok(req.firstCall.args[0].includes('/records/batch?items='), 'the batch route')
  t.equal(results[0].status, 'fulfilled')
  t.ok(Array.isArray(results[0].value), 'a real array, as list() returns')
  t.equal(results[0].value[0].collection, 'a')
  t.deepEqual(results[0].value.pagination, rowsBody('a', 2).pagination, 'pagination attached as list() does')
  t.equal(results[1].value[0].collection, 'b')
  t.equal(results[2].status, 'rejected', 'a failed item rejects only its own caller')
  t.equal(results[2].reason.status, 403, 'with the status _request would have thrown')
  t.equal(results[2].reason.message, 'no grant', 'and the same message')
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: identical queries share one item; every sharer gets its own copy', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) => ({
    success: true,
    data: itemsOf(endpoint).map((it) => ({ status: 200, body: rowsBody(it.collection) }))
  }))
  const [x, y, z] = await Promise.all([
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'b' })
  ])
  t.equal(req.callCount, 1)
  t.equal(itemsOf(req.firstCall.args[0]).length, 2, 'the duplicate query is one item')
  t.deepEqual([...x], [...y], 'same rows')
  t.notEqual(x, y, 'not the same array')
  t.notEqual(x[0], y[0], 'not the same row objects')
  t.deepEqual(y.pagination, x.pagination, 'the copy keeps pagination')
  t.equal(z[0].collection, 'b')
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: a window with ONE query sends the plain GET /records', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').resolves(rowsBody('a'))
  const rows = await svc.records.list({ collection: 'a' }, { limit: 10 })
  t.equal(req.callCount, 1)
  t.equal(req.firstCall.args[0], '/workspaces/ws-1/records?collection=a&limit=10')
  t.equal(rows[0].collection, 'a')
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: a server without the batch route (404) falls back to one GET per query', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) => {
    if (endpoint.includes('/records/batch')) {
      const err = new Error('record not found')
      err.status = 404
      throw err
    }
    const col = new URLSearchParams(endpoint.split('?')[1]).get('collection')
    return rowsBody(col)
  })
  const [a, b] = await Promise.all([
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'b' })
  ])
  t.equal(req.callCount, 3, 'one refused batch + two singles')
  t.equal(a[0].collection, 'a')
  t.equal(b[0].collection, 'b')
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: a batch call that fails otherwise (401) rejects every caller with that error', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const err = new Error('Unauthorized')
  err.status = 401
  const req = sandbox.stub(svc, '_request').rejects(err)
  const results = await Promise.allSettled([
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'b' })
  ])
  t.equal(req.callCount, 1, 'no fallback storm on auth failure')
  t.deepEqual(results.map((r) => r.status), ['rejected', 'rejected'])
  t.equal(results[0].reason.status, 401)
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: more than 25 queries split into batches of at most 25', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) => ({
    success: true,
    data: itemsOf(endpoint).map((it) => ({ status: 200, body: rowsBody(it.collection) }))
  }))
  const calls = Array.from({ length: 30 }, (_, i) => svc.records.list({ collection: `c${i}` }))
  const out = await Promise.all(calls)
  t.equal(req.callCount, 2, '25 + 5')
  t.equal(itemsOf(req.firstCall.args[0]).length, 25)
  t.equal(out[29][0].collection, 'c29', 'order kept across chunks')
  sandbox.restore()
  t.end()
})

test('records.listBatch refuses items over the server character bound, nothing sent', async (t) => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  const long = 'c'.repeat(RECORDS_BATCH_MAX_CHARS)
  try {
    await svc.records.listBatch([{ filter: { collection: long } }, { filter: { collection: 'b' } }])
    t.fail('over-bound batch must throw')
  } catch (e) {
    t.ok(/server bound is 4096/.test(e.message))
  }
  t.equal(req.called, false)
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: batches stay under the character bound; a query too long to share goes as a plain GET', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) =>
    endpoint.includes('/records/batch')
      ? { success: true, data: itemsOf(endpoint).map((it) => ({ status: 200, body: rowsBody(it.collection) })) }
      : rowsBody(new URLSearchParams(endpoint.split('?')[1]).get('collection'))
  )
  const big = 'x'.repeat(RECORDS_BATCH_MAX_CHARS) // alone it exceeds the bound
  const mid = (i) => `m${i}-` + 'y'.repeat(900) // ~4 fit in one batch
  const out = await Promise.all([
    svc.records.list({ collection: big }),
    ...Array.from({ length: 8 }, (_, i) => svc.records.list({ collection: mid(i) }))
  ])
  const paths = req.getCalls().map((c) => c.args[0])
  const batches = paths.filter((p) => p.includes('/records/batch'))
  t.ok(batches.length >= 2, 'the mid queries split across batches')
  for (const p of batches) {
    t.ok(JSON.stringify(itemsOf(p)).length <= RECORDS_BATCH_MAX_CHARS, 'each batch within the bound')
  }
  t.equal(paths.filter((p) => p.includes(`/records?collection=${big}`)).length, 1, 'the long query is its own GET')
  t.equal(out[0][0].collection, big)
  t.equal(out[8][0].collection, mid(7))
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: two workspaces never share a batch', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) =>
    endpoint.includes('/records/batch')
      ? { success: true, data: itemsOf(endpoint).map((it) => ({ status: 200, body: rowsBody(it.collection) })) }
      : rowsBody('x')
  )
  await Promise.all([
    svc.records.list({ collection: 'a' }, { workspaceId: 'ws-1' }),
    svc.records.list({ collection: 'b' }, { workspaceId: 'ws-1' }),
    svc.records.list({ collection: 'a' }, { workspaceId: 'ws-2' })
  ])
  const paths = req.getCalls().map((c) => c.args[0])
  t.equal(paths.filter((p) => p.startsWith('/workspaces/ws-1/records/batch')).length, 1)
  t.equal(paths.filter((p) => p.startsWith('/workspaces/ws-2/records?')).length, 1, 'ws-2 alone → single GET')
  sandbox.restore()
  t.end()
})

test('coalesceRecordReads: list(filter, { coalesce: false }) opts one call out', async (t) => {
  const svc = makeService({ options: { coalesceRecordReads: true } })
  const req = sandbox.stub(svc, '_request').callsFake(async (endpoint) =>
    endpoint.includes('/records/batch')
      ? { success: true, data: itemsOf(endpoint).map((it) => ({ status: 200, body: rowsBody(it.collection) })) }
      : rowsBody('solo')
  )
  await Promise.all([
    svc.records.list({ collection: 'a' }),
    svc.records.list({ collection: 'b' }),
    svc.records.list({ collection: 'solo' }, { coalesce: false })
  ])
  const paths = req.getCalls().map((c) => c.args[0])
  t.ok(paths.includes('/workspaces/ws-1/records?collection=solo'), 'opted-out call is its own GET')
  t.equal(paths.filter((p) => p.includes('/records/batch')).length, 1)
  sandbox.restore()
  t.end()
})
