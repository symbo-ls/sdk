import test from 'tape'
import sinon from 'sinon'
import { IntegrationService } from '../../IntegrationService.js'

// Unit coverage for the marketplace install/uninstall/entitlement lifecycle
// (CU-INT §180) — /marketplace/integrations/*. Distinct resource from the
// /org-integrations/* CRUD (orgIntegrationCrud.test.js): this is the paid-
// install + entitlement surface that gates a paid kind's capability calls.
// Mock strategy mirrors the sibling org-integration test files: `_call`
// stub for URL/method/body, `_request` stub for the bare-payload / envelope
// contract. Server gating lives in
// server/src/domains/billing/controllers/MarketplaceIntegrationsController.js.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new IntegrationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── listMarketplaceEntitlements — GET with query params ────────────────────

test('listMarketplaceEntitlements GETs /marketplace/integrations/entitlements with workspaceId + status', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ items: [] })

  await svc.listMarketplaceEntitlements('ws9', { status: 'active,trialing' })

  const [, path, opts] = stub.firstCall.args
  t.equal(
    path,
    '/marketplace/integrations/entitlements?workspaceId=ws9&status=active%2Ctrialing',
    'URL carries workspaceId + status'
  )
  t.equal(opts, undefined, 'GET — no options bag')
  sandbox.restore()
  t.end()
})

test('listMarketplaceEntitlements omits status when not given (workspaceId only)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ items: [] })

  await svc.listMarketplaceEntitlements('ws9')

  t.equal(
    stub.firstCall.args[1],
    '/marketplace/integrations/entitlements?workspaceId=ws9',
    'only workspaceId in the query string'
  )
  sandbox.restore()
  t.end()
})

test('listMarketplaceEntitlements returns the bare { items } payload verbatim', async t => {
  t.plan(1)
  const svc = makeService()
  const items = [{ id: 'ent1', kind: 'stripe-billing', status: 'active' }]
  sandbox.stub(svc, '_request').resolves({ items })

  const result = await svc.listMarketplaceEntitlements('ws9')
  t.deepEqual(result, { items }, 'bare payload passes through _call untouched')
  sandbox.restore()
  t.end()
})

test('listMarketplaceEntitlements throws without workspaceId', t => {
  t.plan(1)
  const svc = makeService()
  t.throws(() => svc.listMarketplaceEntitlements(), /workspaceId is required/)
  sandbox.restore()
  t.end()
})

// ─── checkMarketplaceEntitlement — GET with query params ────────────────────

test('checkMarketplaceEntitlement GETs /marketplace/integrations/entitlement-check with workspaceId + kind', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ active: false, entitlement: null })

  await svc.checkMarketplaceEntitlement({ workspaceId: 'ws9', kind: 'stripe-billing' })

  const [, path, opts] = stub.firstCall.args
  t.equal(
    path,
    '/marketplace/integrations/entitlement-check?workspaceId=ws9&kind=stripe-billing',
    'URL carries workspaceId + kind'
  )
  t.equal(opts, undefined, 'GET — no options bag')
  sandbox.restore()
  t.end()
})

test('checkMarketplaceEntitlement returns the bare { active, entitlement } payload verbatim', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = { active: true, entitlement: { id: 'ent1', status: 'active' } }
  sandbox.stub(svc, '_request').resolves(payload)

  const result = await svc.checkMarketplaceEntitlement({ workspaceId: 'ws9', kind: 'stripe-billing' })
  t.deepEqual(result, payload, 'bare payload passes through _call untouched')
  sandbox.restore()
  t.end()
})

test('checkMarketplaceEntitlement throws without workspaceId / kind', t => {
  t.plan(2)
  const svc = makeService()
  t.throws(() => svc.checkMarketplaceEntitlement({ kind: 'stripe-billing' }), /workspaceId is required/)
  t.throws(() => svc.checkMarketplaceEntitlement({ workspaceId: 'ws9' }), /kind is required/)
  sandbox.restore()
  t.end()
})

// ─── installMarketplaceIntegration — POST body VERBATIM ─────────────────────

test('installMarketplaceIntegration POSTs /marketplace/integrations/install with the payload verbatim', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, installed: 'free', orgIntegrationId: 'oi1' })
  const payload = {
    orgId: 'org1',
    workspaceId: 'ws9',
    kind: 'webhook',
    slug: 'acme',
    scopeType: 'workspace',
    displayName: 'Acme Webhook',
    config: { url: 'https://example.com' },
    secret: 'shh',
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel'
  }

  await svc.installMarketplaceIntegration(payload)

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/marketplace/integrations/install', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(opts.body, payload, 'body is the payload verbatim (secret + Stripe redirect urls ride along)')
  sandbox.restore()
  t.end()
})

test('installMarketplaceIntegration returns the installed-variant payload (checkout_required)', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = {
    ok: true,
    installed: 'checkout_required',
    orgIntegrationId: 'oi1',
    checkoutUrl: 'https://checkout.stripe.com/xyz',
    sessionId: 'cs_123'
  }
  sandbox.stub(svc, '_request').resolves(payload)

  const result = await svc.installMarketplaceIntegration({ orgId: 'org1', workspaceId: 'ws9', kind: 'paid-kind' })
  t.deepEqual(result, payload, 'checkout_required shape passes through untouched')
  sandbox.restore()
  t.end()
})

test('installMarketplaceIntegration throws without orgId / workspaceId / kind', t => {
  t.plan(3)
  const svc = makeService()
  t.throws(
    () => svc.installMarketplaceIntegration({ workspaceId: 'ws9', kind: 'webhook' }),
    /orgId is required/
  )
  t.throws(
    () => svc.installMarketplaceIntegration({ orgId: 'org1', kind: 'webhook' }),
    /workspaceId is required/
  )
  t.throws(
    () => svc.installMarketplaceIntegration({ orgId: 'org1', workspaceId: 'ws9' }),
    /kind is required/
  )
  sandbox.restore()
  t.end()
})

// ─── uninstallMarketplaceIntegration — POST body VERBATIM ───────────────────

test('uninstallMarketplaceIntegration POSTs /marketplace/integrations/uninstall with the payload verbatim', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, uninstalled: true })
  const payload = {
    orgId: 'org1',
    workspaceId: 'ws9',
    kind: 'webhook',
    slug: 'acme',
    cancelSubscription: false
  }

  await svc.uninstallMarketplaceIntegration(payload)

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/marketplace/integrations/uninstall', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(opts.body, payload, 'body is the payload verbatim (cancelSubscription:false rides along)')
  sandbox.restore()
  t.end()
})

test('uninstallMarketplaceIntegration returns the bare { ok, uninstalled, ... } payload verbatim', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = { ok: true, uninstalled: true, canceledSubscription: true, entitlementId: 'ent1' }
  sandbox.stub(svc, '_request').resolves(payload)

  const result = await svc.uninstallMarketplaceIntegration({ orgId: 'org1', workspaceId: 'ws9', kind: 'webhook' })
  t.deepEqual(result, payload, 'bare payload passes through _call untouched')
  sandbox.restore()
  t.end()
})

test('uninstallMarketplaceIntegration throws without orgId / workspaceId / kind', t => {
  t.plan(3)
  const svc = makeService()
  t.throws(
    () => svc.uninstallMarketplaceIntegration({ workspaceId: 'ws9', kind: 'webhook' }),
    /orgId is required/
  )
  t.throws(
    () => svc.uninstallMarketplaceIntegration({ orgId: 'org1', kind: 'webhook' }),
    /workspaceId is required/
  )
  t.throws(
    () => svc.uninstallMarketplaceIntegration({ orgId: 'org1', workspaceId: 'ws9' }),
    /kind is required/
  )
  sandbox.restore()
  t.end()
})

// ─── envelope contract — _call unwraps { success, data } when present ───────

test('marketplace methods unwrap the { success, data } envelope when the server sends one', async t => {
  t.plan(1)
  const svc = makeService()
  const data = { active: true, entitlement: { id: 'ent1' } }
  sandbox.stub(svc, '_request').resolves({ success: true, data, message: 'ok' })

  const result = await svc.checkMarketplaceEntitlement({ workspaceId: 'ws9', kind: 'stripe-billing' })
  t.deepEqual(result, data, 'envelope.data surfaces when success:true')
  sandbox.restore()
  t.end()
})

test('marketplace methods throw the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'no_active_entitlement' })

  try {
    await svc.installMarketplaceIntegration({ orgId: 'org1', workspaceId: 'ws9', kind: 'paid-kind' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'no_active_entitlement', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})
