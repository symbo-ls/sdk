import test from 'tape'
import sinon from 'sinon'
import { IntegrationService } from '../../IntegrationService.js'

// Unit coverage for the capability dispatcher (data plane) behind the
// org-integration CRUD — POST /org-integrations/call (body-addressed) and
// POST /org-integrations/:idOrSlug/call (row-addressed). Mirrors
// orgIntegrationCrud.test.js's mock strategy: `_call` stub for URL/method/
// body construction, `_request` stub for the { ok, status, result } passthrough
// contract. Server gating + entitlement checks live in
// server/src/domains/integrations/controllers/OrgIntegrationsController.js.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new IntegrationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── row-addressed — idOrSlug given ──────────────────────────────────────────

test('callOrgIntegrationCapability POSTs /org-integrations/:idOrSlug/call when idOrSlug is given', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, status: 200, result: {} })

  await svc.callOrgIntegrationCapability({
    orgId: 'org1',
    idOrSlug: 'row123',
    capability: 'sendEmail',
    args: { to: 'a@b.com' },
    workspaceId: 'ws9'
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/row123/call', 'row-addressed URL')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(
    opts.body,
    { orgId: 'org1', capability: 'sendEmail', args: { to: 'a@b.com' }, workspaceId: 'ws9' },
    'body carries orgId + capability + args + workspaceId (no kind — not disambiguating)'
  )
  sandbox.restore()
  t.end()
})

test('callOrgIntegrationCapability includes kind in the row-addressed body only when given (slug disambiguator)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, status: 200, result: {} })

  await svc.callOrgIntegrationCapability({
    orgId: 'org1',
    idOrSlug: 'ambiguous-slug',
    kind: 'webhook',
    capability: 'ping'
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/ambiguous-slug/call', 'row-addressed URL')
  t.equal(opts.body.kind, 'webhook', 'kind rides along to disambiguate the slug')
  sandbox.restore()
  t.end()
})

// ─── body-addressed — idOrSlug omitted ───────────────────────────────────────

test('callOrgIntegrationCapability POSTs /org-integrations/call when idOrSlug is omitted', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, status: 200, result: {} })

  await svc.callOrgIntegrationCapability({
    orgId: 'org1',
    kind: 'webhook',
    slug: 'acme',
    scopeType: 'workspace',
    scopeId: 'ws9',
    capability: 'ping',
    args: { foo: 'bar' },
    workspaceId: 'ws9'
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/call', 'body-addressed URL')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(
    opts.body,
    {
      orgId: 'org1',
      capability: 'ping',
      args: { foo: 'bar' },
      workspaceId: 'ws9',
      kind: 'webhook',
      slug: 'acme',
      scopeType: 'workspace',
      scopeId: 'ws9'
    },
    'body carries the full scope key + capability + args + workspaceId'
  )
  sandbox.restore()
  t.end()
})

test('callOrgIntegrationCapability omits undefined optional fields from the body-addressed request', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true, status: 200, result: {} })

  await svc.callOrgIntegrationCapability({ orgId: 'org1', kind: 'webhook', capability: 'ping' })

  t.deepEqual(
    stub.firstCall.args[2].body,
    { orgId: 'org1', capability: 'ping', kind: 'webhook' },
    'args/workspaceId/slug/scopeType/scopeId all default server-side when omitted'
  )
  sandbox.restore()
  t.end()
})

// ─── validation ───────────────────────────────────────────────────────────────

test('callOrgIntegrationCapability throws without orgId / capability', t => {
  t.plan(3)
  const svc = makeService()
  t.throws(() => svc.callOrgIntegrationCapability({ capability: 'ping' }), /orgId is required/)
  t.throws(() => svc.callOrgIntegrationCapability({ orgId: 'org1' }), /capability is required/)
  t.throws(() => svc.callOrgIntegrationCapability(), /orgId is required/)
  sandbox.restore()
  t.end()
})

test('callOrgIntegrationCapability throws without kind when idOrSlug is not provided', t => {
  t.plan(1)
  const svc = makeService()
  t.throws(
    () => svc.callOrgIntegrationCapability({ orgId: 'org1', capability: 'ping' }),
    /kind is required when idOrSlug is not provided/
  )
  sandbox.restore()
  t.end()
})

test('callOrgIntegrationCapability does NOT require kind when idOrSlug is provided', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({ ok: true, status: 200, result: {} })

  await svc.callOrgIntegrationCapability({ orgId: 'org1', idOrSlug: 'row123', capability: 'ping' })
  t.pass('no throw — kind is optional on the row-addressed route')
  sandbox.restore()
  t.end()
})

// ─── response shape ─────────────────────────────────────────────────────────

test('callOrgIntegrationCapability returns the bare { ok, status, result } payload verbatim', async t => {
  t.plan(1)
  const svc = makeService()
  const payload = { ok: true, status: 200, result: { sent: true }, entitlementId: 'ent1' }
  sandbox.stub(svc, '_request').resolves(payload)

  const result = await svc.callOrgIntegrationCapability({
    orgId: 'org1',
    kind: 'webhook',
    capability: 'ping'
  })

  t.deepEqual(result, payload, 'bare capability-call shape passes through _call untouched')
  sandbox.restore()
  t.end()
})

test('callOrgIntegrationCapability throws the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'workspace_required' })

  try {
    await svc.callOrgIntegrationCapability({ orgId: 'org1', kind: 'stripe', capability: 'charge' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspace_required', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})
