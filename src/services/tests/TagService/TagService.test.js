import test from 'tape'
import sinon from 'sinon'
import { TagService } from '../../TagService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new TagService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list — bare + optional group filter ──────────────────────────────────────

test('tags.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'tags.list', 'name')
  t.equal(stub.firstCall.args[1], '/tags', 'no query string')
  sandbox.restore()
  t.end()
})

test('tags.list threads the group filter', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ group: 'priority' })
  t.ok(stub.firstCall.args[1].includes('group=priority'), 'group threaded')
  sandbox.restore()
  t.end()
})

// ─── get / create / update / remove ───────────────────────────────────────────

test('tags.get GETs /tags/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('t/1')
  t.equal(stub.firstCall.args[0], 'tags.get', 'name')
  t.equal(stub.firstCall.args[1], '/tags/t%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('tags.create POSTs { key, label, color, group }', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { key: 'urgent', label: 'Urgent', color: 'red', group: 'priority' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/tags', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body carries key + presentation fields')
  sandbox.restore()
  t.end()
})

test('tags.update PATCHes /tags/:id (label/color/group — key immutable)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('t1', { label: 'Renamed', color: 'blue' })
  t.equal(stub.firstCall.args[1], '/tags/t1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { label: 'Renamed', color: 'blue' }, 'body')
  sandbox.restore()
  t.end()
})

test('tags.remove DELETEs /tags/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('t1')
  t.equal(stub.firstCall.args[1], '/tags/t1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ────────────────────────────────────────────────────

test('tags threads workspaceId as a query param across reads + writes', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ group: 'priority' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('t1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ key: 'k' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.update('t1', { label: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'update threads ws')
  await svc.remove('t1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
