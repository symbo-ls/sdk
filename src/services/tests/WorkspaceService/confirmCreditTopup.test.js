import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// confirmCreditTopup — the return page of a credit top-up confirms its own
// paid Stripe checkout session (`?session_id=` on the success URL), so the
// credits never depend on one webhook delivery. Server: POST
// /core/workspaces/:workspaceId/billing/topups/confirm { sessionId } →
// { applied, alreadyApplied, credits, balance }; a repeat is alreadyApplied.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('confirmCreditTopup POSTs the session id to the workspace confirm route', async t => {
  const svc = makeService()
  const call = sandbox.stub(svc, '_call').resolves({ applied: true, alreadyApplied: false, credits: 1000 })
  const out = await svc.confirmCreditTopup('ws1', 'cs_test_abc')
  t.equal(call.firstCall.args[0], 'confirmCreditTopup')
  t.equal(call.firstCall.args[1], '/workspaces/ws1/billing/topups/confirm')
  t.deepEqual(call.firstCall.args[2], { method: 'POST', body: { sessionId: 'cs_test_abc' } })
  t.equal(out.applied, true)
  sandbox.restore()
  t.end()
})

test('confirmCreditTopup refuses a missing workspace or session id before any request', async t => {
  const svc = makeService()
  const call = sandbox.stub(svc, '_call').resolves({})
  for (const args of [[null, 'cs_test_abc'], ['ws1', ''], ['ws1', undefined]]) {
    try {
      await svc.confirmCreditTopup(...args)
      t.fail(`expected a throw for ${JSON.stringify(args)}`)
    } catch (err) {
      t.ok(/required/.test(err.message), err.message)
    }
  }
  t.equal(call.called, false)
  sandbox.restore()
  t.end()
})

test('confirmCreditTopup has the top-level proxy like createCreditTopupCheckout', t => {
  t.equal(SERVICE_METHODS.confirmCreditTopup, 'workspace')
  t.end()
})
