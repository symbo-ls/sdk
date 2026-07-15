import test from 'tape'
import sinon from 'sinon'
import { AttachmentService } from '../../AttachmentService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AttachmentService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list — entity-scoped (entityType + entityId) ─────────────────────────────

test('attachments.list GETs /attachments with entityType + entityId query params', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'doc', entityId: 'd1' })
  t.equal(stub.firstCall.args[0], 'attachments.list', 'name')
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/attachments?'), 'GET /attachments with query')
  t.ok(path.includes('entityType=doc'), 'entityType threaded')
  t.ok(path.includes('entityId=d1'), 'entityId threaded')
  sandbox.restore()
  t.end()
})

// ─── create / remove ──────────────────────────────────────────────────────────

test('attachments.create POSTs the payload (entityRef + file + label) to /attachments', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { entityRef: { type: 'doc', id: 'd1' }, file: 'f1', label: 'spec.pdf' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/attachments', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body carries entityRef + file + label')
  sandbox.restore()
  t.end()
})

test('attachments.remove DELETEs /attachments/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('a/1')
  t.equal(stub.firstCall.args[1], '/attachments/a%2F1', 'encoded path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── no update — the server exposes no PATCH /attachments/:id ──────────────────

test('attachments has no update() method (server exposes no PATCH route)', async t => {
  t.plan(1)
  const svc = makeService()
  t.equal(typeof svc.update, 'undefined', 'update is intentionally absent')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ────────────────────────────────────────────────────

test('attachments threads workspaceId as a query param across list/create/remove', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ entityType: 'doc', entityId: 'd1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.create({ entityRef: { type: 'doc', id: 'd1' }, file: 'f1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
