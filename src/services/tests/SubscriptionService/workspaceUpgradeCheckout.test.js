import test from 'tape'
import sinon from 'sinon'
import { SubscriptionService } from '../../SubscriptionService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for createWorkspaceSubscriptionCheckout — the "Upgrade"
// tier-card CTA on workspace/pages/admin/usage.js (tickets/fable.md PRICE-3
// redesign, Nika 2026-08-13: "Request upgrade → >> Upgrade - goes to
// stipe"). The server route this calls (`POST /subscriptions/checkout`) is
// a CONTRACT owned by tickets/opus.md PRICE-5 and does not exist yet
// (verified against server/src/domains/billing/routes/subscriptions.js —
// only `/` is wired) — this suite only pins the SDK's own request-shaping
// contract (endpoint, method, body, envelope unwrap, required args), the
// same scope WorkspaceService/usageByActor.test.js holds for its sibling
// CONTRACT method. Transport is mocked at `_request`.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new SubscriptionService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('teardown-before', (t) => {
  sandbox.restore()
  t.end()
})

test('createWorkspaceSubscriptionCheckout is flat-exposed by the SDK under the subscription service', (t) => {
  t.plan(1)
  t.equal(SERVICE_METHODS.createWorkspaceSubscriptionCheckout, 'subscription')
})

test('createWorkspaceSubscriptionCheckout throws without workspaceId (no request sent)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.createWorkspaceSubscriptionCheckout(undefined, { planId: 'plan1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Workspace ID is required')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('createWorkspaceSubscriptionCheckout throws without planId (no request sent)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.createWorkspaceSubscriptionCheckout('ws1', {})
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Plan ID is required')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('createWorkspaceSubscriptionCheckout POSTs /subscriptions/checkout with workspaceId + planId + default pricingKey', async (t) => {
  t.plan(4)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { type: 'checkout_required', url: 'https://checkout.stripe.com/x', sessionId: 'cs_1' }
  })

  await svc.createWorkspaceSubscriptionCheckout('ws1', { planId: 'plan1' })

  const [endpoint, opts] = request.firstCall.args
  t.equal(endpoint, '/subscriptions/checkout')
  t.equal(opts.method, 'POST')
  const body = JSON.parse(opts.body)
  // JSON.stringify drops undefined-valued keys — successUrl/cancelUrl are
  // legitimately absent (not sent as literal `null`) when the caller omits
  // them, matching the sibling createSubscription/createCreditTopupCheckout
  // request-shaping contract.
  t.deepEqual(body, {
    workspaceId: 'ws1',
    planId: 'plan1',
    pricingKey: 'monthly'
  })
  t.equal(opts.methodName, 'createWorkspaceSubscriptionCheckout')
  sandbox.restore()
})

test('createWorkspaceSubscriptionCheckout threads successUrl/cancelUrl and a non-default pricingKey', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.createWorkspaceSubscriptionCheckout('ws1', {
    planId: 'plan1',
    pricingKey: 'yearly',
    successUrl: 'https://app.example.co/w/acme/ws/admin/usage',
    cancelUrl: 'https://app.example.co/w/acme/ws/admin/usage'
  })

  const [, opts] = request.firstCall.args
  t.deepEqual(JSON.parse(opts.body), {
    workspaceId: 'ws1',
    planId: 'plan1',
    pricingKey: 'yearly',
    successUrl: 'https://app.example.co/w/acme/ws/admin/usage',
    cancelUrl: 'https://app.example.co/w/acme/ws/admin/usage'
  })
  sandbox.restore()
})

test('createWorkspaceSubscriptionCheckout resolves the unwrapped data, not the {success,data} envelope', async (t) => {
  t.plan(1)
  const svc = makeService()
  const data = { type: 'checkout_required', url: 'https://checkout.stripe.com/x', sessionId: 'cs_1' }
  sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.createWorkspaceSubscriptionCheckout('ws1', { planId: 'plan1' })

  t.deepEqual(result, data)
  sandbox.restore()
})

test('createWorkspaceSubscriptionCheckout — a 404/not-live route rejects with a real Error the caller can catch', async (t) => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_request').rejects(new Error('Not Found'))

  try {
    await svc.createWorkspaceSubscriptionCheckout('ws1', { planId: 'plan1' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err instanceof Error)
    t.ok(err.message.includes('Failed to create workspace subscription checkout'))
  }
  sandbox.restore()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
