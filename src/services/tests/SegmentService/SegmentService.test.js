import test from 'tape'
import sinon from 'sinon'
import { SegmentService } from '../../SegmentService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new SegmentService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('segments.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'segments.list', 'name')
  t.equal(stub.firstCall.args[1], '/segments', 'no query string')
  sandbox.restore()
  t.end()
})

test('segments.list threads includeDeleted flag as true', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ includeDeleted: true })
  t.ok(stub.firstCall.args[1].includes('includeDeleted=true'), 'includeDeleted flag')
  sandbox.restore()
  t.end()
})

test('segments.get GETs /segments/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('s/1')
  t.equal(stub.firstCall.args[0], 'segments.get', 'name')
  t.equal(stub.firstCall.args[1], '/segments/s%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('segments.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { name: 'Gold tier', kind: 'smart', query: { role: 'customer' } }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/segments', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('segments.update PATCHes /segments/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('s1', { name: 'Renamed' })
  t.equal(stub.firstCall.args[1], '/segments/s1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { name: 'Renamed' }, 'body')
  sandbox.restore()
  t.end()
})

test('segments.remove DELETEs /segments/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('s1')
  t.equal(stub.firstCall.args[1], '/segments/s1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('segments.listMembers GETs /segments/:id/members', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listMembers('s1')
  t.equal(stub.firstCall.args[0], 'segments.listMembers', 'name')
  t.equal(stub.firstCall.args[1], '/segments/s1/members', 'members path')
  sandbox.restore()
  t.end()
})

test('segments reads + writes + members thread workspaceId as a query param', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.create({ name: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('s1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  await svc.listMembers('s1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'listMembers threads ws')
  sandbox.restore()
  t.end()
})
