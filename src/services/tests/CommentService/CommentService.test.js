import test from 'tape'
import sinon from 'sinon'
import { CommentService } from '../../CommentService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new CommentService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list — entity-scoped (entityType + entityId) ─────────────────────────────

test('comments.list GETs /comments with entityType + entityId query params', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', entityId: 't1' })
  t.equal(stub.firstCall.args[0], 'comments.list', 'name')
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/comments?'), 'GET /comments with query')
  t.ok(path.includes('entityType=ticket'), 'entityType threaded')
  t.ok(path.includes('entityId=t1'), 'entityId threaded')
  sandbox.restore()
  t.end()
})

test('comments.list threads workspaceId from filter and from options', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', entityId: 't1', workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'workspaceId from filter')
  await svc.list({ entityType: 'ticket', entityId: 't1' }, { workspaceId: 'ws2' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws2'), 'workspaceId from options')
  sandbox.restore()
  t.end()
})

// ─── create / update / remove ─────────────────────────────────────────────────

test('comments.create POSTs the payload (entityRef + body + replyTo) to /comments', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { entityRef: { type: 'ticket', id: 't1' }, body: 'hi', replyTo: 'c0' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/comments', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body carries entityRef + body + replyTo')
  sandbox.restore()
  t.end()
})

test('comments.update PATCHes /comments/:id encoded', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('c/1', { body: 'edited' })
  t.equal(stub.firstCall.args[1], '/comments/c%2F1', 'encoded path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { body: 'edited' }, 'body')
  sandbox.restore()
  t.end()
})

test('comments.remove DELETEs /comments/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('c1')
  t.equal(stub.firstCall.args[1], '/comments/c1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── no GET /comments/:id — the server exposes no single-comment read ─────────

test('comments has no get() method (server exposes no GET /comments/:id)', async t => {
  t.plan(1)
  const svc = makeService()
  t.equal(typeof svc.get, 'undefined', 'get is intentionally absent')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading across writes ──────────────────────────────────────

test('comments threads workspaceId as a query param across create/update/remove', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.create({ body: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.update('c1', { body: 'y' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'update threads ws')
  await svc.remove('c1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
