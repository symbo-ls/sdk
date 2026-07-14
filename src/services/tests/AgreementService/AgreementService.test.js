import test from 'tape'
import sinon from 'sinon'
import { AgreementService } from '../../AgreementService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AgreementService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('agreements.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'agreements.list', 'name')
  t.equal(stub.firstCall.args[1], '/agreements', 'no query string')
  sandbox.restore()
  t.end()
})

test('agreements.list threads kind/status/partyId', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ kind: 'contract', status: 'active', partyId: 'p1' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('kind=contract'), 'kind threaded')
  t.ok(path.includes('status=active'), 'status threaded')
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  sandbox.restore()
  t.end()
})

test('agreements.get GETs /agreements/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('a/1')
  t.equal(stub.firstCall.args[0], 'agreements.get', 'name')
  t.equal(stub.firstCall.args[1], '/agreements/a%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('agreements.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { kind: 'quote', partyId: 'p1', lines: [] }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/agreements', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('agreements.update PATCHes /agreements/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('a1', { status: 'signed' })
  t.equal(stub.firstCall.args[1], '/agreements/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { status: 'signed' }, 'body')
  sandbox.restore()
  t.end()
})

test('agreements.remove DELETEs /agreements/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('a1')
  t.equal(stub.firstCall.args[1], '/agreements/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('agreements threads workspaceId as a query param across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ kind: 'quote' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
