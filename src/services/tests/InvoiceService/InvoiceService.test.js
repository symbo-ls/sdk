import test from 'tape'
import sinon from 'sinon'
import { InvoiceService } from '../../InvoiceService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new InvoiceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('invoices.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'invoices.list', 'name')
  t.equal(stub.firstCall.args[1], '/invoices', 'no query string')
  sandbox.restore()
  t.end()
})

test('invoices.list threads direction/status/partyId + overdue flag', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ direction: 'outbound', status: 'open', partyId: 'p1', overdue: true })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('direction=outbound'), 'direction threaded')
  t.ok(path.includes('status=open'), 'status threaded')
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  t.ok(path.includes('overdue=true'), 'overdue flag as true')
  sandbox.restore()
  t.end()
})

test('invoices.get GETs /invoices/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('i/1')
  t.equal(stub.firstCall.args[0], 'invoices.get', 'name')
  t.equal(stub.firstCall.args[1], '/invoices/i%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('invoices.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { direction: 'outbound', partyId: 'p1', lines: [] }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/invoices', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('invoices.update PATCHes /invoices/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('i1', { dueAt: '2026-08-01' })
  t.equal(stub.firstCall.args[1], '/invoices/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { dueAt: '2026-08-01' }, 'body')
  sandbox.restore()
  t.end()
})

test('invoices.issue POSTs /invoices/:id/issue (draft → open, no body)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.issue('i1')
  t.equal(stub.firstCall.args[0], 'invoices.issue', 'name')
  t.equal(stub.firstCall.args[1], '/invoices/i1/issue', 'issue path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  sandbox.restore()
  t.end()
})

test('invoices.issue encodes the id segment', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.issue('i/1')
  t.equal(stub.firstCall.args[1], '/invoices/i%2F1/issue', 'id encoded before /issue')
  sandbox.restore()
  t.end()
})

test('invoices.remove DELETEs /invoices/:id (void, never hard-delete)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('i1')
  t.equal(stub.firstCall.args[1], '/invoices/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('invoices threads workspaceId as a query param across reads, writes + issue', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('i1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ direction: 'outbound' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.issue('i1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'issue threads ws')
  await svc.remove('i1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
