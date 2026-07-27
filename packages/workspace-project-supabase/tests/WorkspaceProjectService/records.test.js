import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

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
