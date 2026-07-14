import test from 'tape'
import sinon from 'sinon'
import { TransactionService } from '../../TransactionService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new TransactionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('transactions.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'transactions.list', 'name')
  t.equal(stub.firstCall.args[1], '/transactions', 'no query string')
  sandbox.restore()
  t.end()
})

test('transactions.list threads kind/partyId/invoiceId', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ kind: 'payment', partyId: 'p1', invoiceId: 'i1' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('kind=payment'), 'kind threaded')
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  t.ok(path.includes('invoiceId=i1'), 'invoiceId threaded')
  sandbox.restore()
  t.end()
})

test('transactions.get GETs /transactions/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('t/1')
  t.equal(stub.firstCall.args[0], 'transactions.get', 'name')
  t.equal(stub.firstCall.args[1], '/transactions/t%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('transactions.create POSTs the payload carrying allocations', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = {
    kind: 'payment',
    amount: 1900,
    currency: 'usd',
    allocations: [{ invoiceId: 'i1', amount: 1900 }]
  }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/transactions', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  t.deepEqual(
    stub.firstCall.args[2].body.allocations,
    [{ invoiceId: 'i1', amount: 1900 }],
    'allocations carried in the settlement body'
  )
  sandbox.restore()
  t.end()
})

test('transactions.update PATCHes /transactions/:id (reconciledAt/note)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('t1', { note: 'reconciled' })
  t.equal(stub.firstCall.args[1], '/transactions/t1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { note: 'reconciled' }, 'body')
  sandbox.restore()
  t.end()
})

test('transactions.remove DELETEs /transactions/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('t1')
  t.equal(stub.firstCall.args[1], '/transactions/t1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('transactions threads workspaceId as a query param across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('t1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ kind: 'payment' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('t1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
