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

// ─── G-M (APP-FAMILY-CONTRACT §4): agreement filter, void with a reason,
// credit notes ────────────────────────────────────────────────────────────────

test('invoices.list forwards agreement (and its alias agreementId)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ agreement: 'a1' })
  t.ok(stub.getCall(0).args[1].includes('agreement=a1'), 'agreement threaded')
  await svc.list({ agreementId: 'a2', status: 'open' }, { workspaceId: 'ws1' })
  const path = stub.getCall(1).args[1]
  t.ok(path.includes('agreement=a2'), 'agreementId goes as agreement')
  t.ok(path.includes('workspaceId=ws1') && path.includes('status=open'), 'other keys kept')
  sandbox.restore()
  t.end()
})

test('invoices.void POSTs /invoices/:id/void with the reason', async t => {
  t.plan(6)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.void('i/1', { reason: 'Duplicate' }, { workspaceId: 'ws1' })
  const [name, path, init] = stub.firstCall.args
  t.equal(name, 'invoices.void', 'name')
  t.equal(path, '/invoices/i%2F1/void?workspaceId=ws1', 'void path, id encoded, ws threaded')
  t.equal(init.method, 'POST', 'POST')
  t.deepEqual(init.body, { reason: 'Duplicate' }, 'reason in the body, never the URL')
  await svc.void('i1')
  await svc.void('i1', null)
  t.deepEqual(stub.secondCall.args[2].body, { reason: null }, 'no reason → null')
  t.deepEqual(stub.thirdCall.args[2].body, { reason: null }, 'a null payload → null')
  sandbox.restore()
  t.end()
})

test('invoices.createCreditNote POSTs /invoices/:id/credit-notes with the payload', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ creditNote: {}, invoice: {} })
  const payload = {
    lines: [{ description: 'Returned', qty: 1, unitAmount: { value: -100, currency: 'GEL' } }],
    expectCredited: 0
  }
  await svc.createCreditNote('i/1', payload, { workspaceId: 'ws1' })
  const [name, path, init] = stub.firstCall.args
  t.equal(name, 'invoices.createCreditNote', 'name')
  t.equal(path, '/invoices/i%2F1/credit-notes?workspaceId=ws1', 'credit-notes path')
  t.equal(init.method, 'POST', 'POST')
  t.deepEqual(init.body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('invoices.listCreditNotes GETs /invoices/:id/credit-notes', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listCreditNotes('i1', { workspaceId: 'ws1' })
  const [name, path, init] = stub.firstCall.args
  t.equal(name, 'invoices.listCreditNotes', 'name')
  t.equal(path, '/invoices/i1/credit-notes?workspaceId=ws1', 'path')
  t.equal(init, undefined, 'a GET (no init)')
  sandbox.restore()
  t.end()
})
