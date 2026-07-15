import test from 'tape'
import sinon from 'sinon'
import { WatcherService } from '../../WatcherService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new WatcherService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list — two scopes: by entity OR by userEmail ─────────────────────────────

test('watchers.list by entity GETs /watchers?entityType=&entityId=', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', entityId: 't1' })
  t.equal(stub.firstCall.args[0], 'watchers.list', 'name')
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/watchers?'), 'GET /watchers with query')
  t.ok(path.includes('entityType=ticket'), 'entityType threaded')
  t.ok(path.includes('entityId=t1'), 'entityId threaded')
  sandbox.restore()
  t.end()
})

test('watchers.list by userEmail GETs /watchers?userEmail=', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ userEmail: 'a@b.co' })
  t.ok(stub.firstCall.args[1].includes('userEmail=a%40b.co'), 'userEmail threaded + encoded')
  sandbox.restore()
  t.end()
})

// ─── watch — POST upsert ──────────────────────────────────────────────────────

test('watchers.watch POSTs the upsert payload (entityRef + level + userEmail) to /watchers', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { entityRef: { type: 'ticket', id: 't1' }, level: 'all', userEmail: 'a@b.co' }
  await svc.watch(payload)
  t.equal(stub.firstCall.args[1], '/watchers', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST (upsert)')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body carries entityRef + level + userEmail')
  sandbox.restore()
  t.end()
})

test('watchers.watch omitting userEmail lets the server stamp the caller', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.watch({ entityRef: { type: 'ticket', id: 't1' }, level: 'mentions' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { entityRef: { type: 'ticket', id: 't1' }, level: 'mentions' },
    'no userEmail → caller-stamped server-side'
  )
  sandbox.restore()
  t.end()
})

// ─── unwatch — DELETE by query (no id) ────────────────────────────────────────

test('watchers.unwatch DELETEs /watchers by query (entityType + entityId + userEmail)', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.unwatch({ entityType: 'ticket', entityId: 't1', userEmail: 'a@b.co' })
  t.equal(stub.firstCall.args[0], 'watchers.unwatch', 'name')
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/watchers?'), 'DELETE /watchers by query, no id segment')
  t.ok(path.includes('entityType=ticket'), 'entityType threaded')
  t.ok(path.includes('entityId=t1'), 'entityId threaded')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ────────────────────────────────────────────────────

test('watchers threads workspaceId as a query param across list/watch/unwatch', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ userEmail: 'a@b.co' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.watch({ entityRef: { type: 'ticket', id: 't1' } }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'watch threads ws')
  await svc.unwatch({ entityType: 'ticket', entityId: 't1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'unwatch threads ws')
  sandbox.restore()
  t.end()
})
