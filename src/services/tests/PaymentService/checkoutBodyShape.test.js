import test from 'tape'
import sinon from 'sinon'
import { PaymentService } from '../../PaymentService.js'

// Regression coverage for tickets/opus.md PRICE-5, gap #3: `checkout()` used
// to send `{ projectId, seats, price, successUrl, cancelUrl }` to
// `POST /payments/checkout`, but the controller
// (server PaymentController.createCheckout) destructures
// `{ projectId, planId, pricingKey, seats, successUrl, cancelUrl }` and
// guards `if (!projectId || !planId || !pricingKey) throw` — `price` was
// silently dropped and every real call 400'd ("Project ID, Plan ID, and
// Pricing Key are required"), independent of whichever direction PRICE-5's
// workspaceId-vs-projectId judgement call resolved to. Reproduced live
// against a running local server before this fix (curl POST
// /core/payments/checkout with a `price` body → HTTP 400).
//
// `window` is stubbed globally so `checkout()`'s default successUrl/
// cancelUrl (which read `window.location.origin`) don't throw under Node.

const sandbox = sinon.createSandbox()

test('setup', (t) => {
  if (typeof global.window === 'undefined') {
    global.window = { location: { origin: 'https://app.example.co' } }
  }
  t.end()
})

const makeService = () => {
  const svc = new PaymentService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('checkout throws without planId (no request sent) — the body-shape guard', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.checkout({ projectId: 'proj-1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Plan ID is required for checkout')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('checkout throws without projectId (no request sent)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.checkout({ planId: 'plan-1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Project ID is required for checkout')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('checkout POSTs /payments/checkout with planId (NOT price) + a default pricingKey', async (t) => {
  t.plan(3)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { type: 'checkout_required', url: 'https://checkout.stripe.com/x', sessionId: 'cs_1' }
  })

  await svc.checkout({ projectId: 'proj-1', planId: 'plan-1' })

  const [endpoint, opts] = request.firstCall.args
  t.equal(endpoint, '/payments/checkout')
  t.equal(opts.method, 'POST')
  const body = JSON.parse(opts.body)
  t.deepEqual(body, {
    projectId: 'proj-1',
    seats: 1,
    planId: 'plan-1',
    pricingKey: 'monthly',
    successUrl: 'https://app.example.co/success',
    cancelUrl: 'https://app.example.co/pricing'
  })
  sandbox.restore()
})

test('checkout body never carries a `price` key', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.checkout({ projectId: 'proj-1', planId: 'plan-1', pricingKey: 'yearly' })

  const body = JSON.parse(request.firstCall.args[1].body)
  t.equal('price' in body, false, 'no stale `price` key ships in the request body')
  sandbox.restore()
})

test('checkoutForPlan sends the given planId, not a lookup-key-shaped `price`', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.checkoutForPlan('proj-1', 'plan-scale-1')

  const body = JSON.parse(request.firstCall.args[1].body)
  t.equal(body.planId, 'plan-scale-1')
  sandbox.restore()
})

test('checkoutForTeam requires an explicit options.planId — no more hardcoded lookup key', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.checkoutForTeam('proj-1', 3)
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err.message.includes('planId'), 'error names the missing planId')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('checkoutForTeam POSTs the caller-supplied planId', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.checkoutForTeam('proj-1', 5, { planId: 'plan-team-1' })

  const body = JSON.parse(request.firstCall.args[1].body)
  t.equal(body.planId, 'plan-team-1')
  sandbox.restore()
})
