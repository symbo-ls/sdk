import test from 'tape'
import sinon from 'sinon'
import { InvoiceService } from '../../InvoiceService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// GET /core/invoices/contract — the bounds the server enforces, read before
// a write (CRUD sweep 2026-10-31). The void sheets of Commerce and Invoices
// had no bound on the reason; a client that copied the server's 500 would
// drift. They read { voidReasonMaxLength } from here instead.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new InvoiceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test.onFinish(() => sandbox.restore())

test('invoices.getContract GETs /invoices/contract and returns the unwrapped data', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ voidReasonMaxLength: 500 })
  const res = await svc.getContract()
  t.equal(stub.firstCall.args[0], 'invoices.getContract', 'name')
  t.equal(stub.firstCall.args[1], '/invoices/contract', 'no query string without a workspace')
  t.notOk(stub.firstCall.args[2], 'a GET: no method override, no body')
  t.deepEqual(res, { voidReasonMaxLength: 500 }, 'the server answer passes through')
  sandbox.restore()
})

test('invoices.getContract threads an explicit workspaceId (encoded)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getContract({ workspaceId: 'ws/1' })
  t.equal(stub.firstCall.args[1], '/invoices/contract?workspaceId=ws%2F1')
  sandbox.restore()
})

const makeSdk = (calls) => {
  const invoices = {
    getContract: (...args) => {
      calls.push(args)
      return Promise.resolve({ voidReasonMaxLength: 500 })
    }
  }
  return { getService: (name) => (name === 'invoices' ? invoices : {}) }
}

test("execute('invoices', 'contract') routes to getContract with only the workspace", async t => {
  t.plan(3)
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const res = await execute('invoices', 'contract', { workspaceId: 'ws1' })
  await execute('invoices', 'contract', {})
  t.deepEqual(calls[0], [{ workspaceId: 'ws1' }], 'workspace threaded as the options positional')
  t.deepEqual(calls[1], [], 'no workspace: no positional (the claim decides server-side)')
  t.deepEqual(res, { voidReasonMaxLength: 500 })
})
