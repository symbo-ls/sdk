import test from 'tape'
import sinon from 'sinon'
import { IntegrationService } from '../../IntegrationService.js'

// Unit coverage for the org-integration CRUD surface (OrgIntegration rows) —
// the connect/grant/scope/order lifecycle behind /org-integrations/*. Mirrors
// the shared integrations facade, moved into the SDK proper. Transport is
// mocked: `_call` stub for URL/method/body construction, `_request` stub for
// the bare-payload / envelope unwrap contract. Server gating + per-key merge
// live in server/src/domains/integrations/*.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new IntegrationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── listOrgIntegrations — GET with query params ─────────────────────────────

test('listOrgIntegrations GETs /org-integrations with the full query string', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ items: [] })

  await svc.listOrgIntegrations({
    orgId: 'org1',
    scopeType: 'workspace',
    scopeId: 'ws9',
    includeParents: false
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(
    path,
    '/org-integrations?orgId=org1&scopeType=workspace&scopeId=ws9&includeParents=false',
    'URL carries orgId + scopeType + scopeId + includeParents'
  )
  t.equal(opts, undefined, 'GET — no options bag (method defaults to GET in _call)')
  t.pass('resolved')
  sandbox.restore()
  t.end()
})

test('listOrgIntegrations omits undefined params (orgId only)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ items: [] })

  await svc.listOrgIntegrations({ orgId: 'org1' })

  t.equal(stub.firstCall.args[1], '/org-integrations?orgId=org1', 'only orgId in the query string')
  sandbox.restore()
  t.end()
})

test('listOrgIntegrations returns the bare { items } payload verbatim (no envelope)', async t => {
  t.plan(2)
  const svc = makeService()
  const items = [{ kind: 'supabase_project', slug: 'acme' }]
  const requestStub = sandbox.stub(svc, '_request').resolves({ items })

  const result = await svc.listOrgIntegrations({ orgId: 'org1' })

  t.equal(requestStub.firstCall.args[0], '/org-integrations?orgId=org1', 'hits list endpoint')
  t.deepEqual(result, { items }, 'bare payload passes through _call untouched')
  sandbox.restore()
  t.end()
})

test('listOrgIntegrations throws without orgId', t => {
  t.plan(2)
  const svc = makeService()
  t.throws(() => svc.listOrgIntegrations({ scopeType: 'org' }), /orgId is required/)
  t.throws(() => svc.listOrgIntegrations(), /orgId is required/)
  sandbox.restore()
  t.end()
})

// ─── upsertOrgIntegration — POST body VERBATIM ───────────────────────────────

test('upsertOrgIntegration POSTs /org-integrations with the payload verbatim', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  const payload = {
    orgId: 'org1',
    kind: 'supabase_project',
    slug: 'acme',
    scopeType: 'workspace',
    scopeId: 'ws9',
    displayName: 'Acme DB',
    secret: 'service-key-xyz',
    config: { tableAllowlist: { listings: ['select', 'update'] }, writeRoles: ['owner'] },
    enabled: true
  }

  await svc.upsertOrgIntegration(payload)

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(opts.body, payload, 'body is the payload verbatim (secret + config.tableAllowlist ride along)')
  sandbox.restore()
  t.end()
})

test('upsertOrgIntegration throws without orgId / kind', t => {
  t.plan(2)
  const svc = makeService()
  t.throws(() => svc.upsertOrgIntegration({ kind: 'supabase_project' }), /orgId is required/)
  t.throws(() => svc.upsertOrgIntegration({ orgId: 'org1' }), /kind is required/)
  sandbox.restore()
  t.end()
})

// ─── deleteOrgIntegration — DELETE with body ─────────────────────────────────

test('deleteOrgIntegration DELETEs /org-integrations with the scope key in the body', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })

  await svc.deleteOrgIntegration({
    orgId: 'org1',
    kind: 'supabase_project',
    slug: 'acme',
    scopeType: 'workspace',
    scopeId: 'ws9'
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations', 'URL matches')
  t.equal(opts.method, 'DELETE', 'method DELETE (identity in the body, not the path)')
  t.deepEqual(
    opts.body,
    { orgId: 'org1', kind: 'supabase_project', slug: 'acme', scopeType: 'workspace', scopeId: 'ws9' },
    'body carries the exact-scope natural key'
  )
  sandbox.restore()
  t.end()
})

test('deleteOrgIntegration omits undefined optional fields from the body', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })

  await svc.deleteOrgIntegration({ orgId: 'org1', kind: 'supabase_project' })

  t.deepEqual(
    stub.firstCall.args[2].body,
    { orgId: 'org1', kind: 'supabase_project' },
    'only defined fields on the wire (slug/scopeType/scopeId default server-side)'
  )
  sandbox.restore()
  t.end()
})

test('deleteOrgIntegration throws without orgId / kind', t => {
  t.plan(2)
  const svc = makeService()
  t.throws(() => svc.deleteOrgIntegration({ kind: 'supabase_project' }), /orgId is required/)
  t.throws(() => svc.deleteOrgIntegration({ orgId: 'org1' }), /kind is required/)
  sandbox.restore()
  t.end()
})

// ─── assignOrgIntegrationScope + reorderOrgIntegrations — POST body VERBATIM ──

test('assignOrgIntegrationScope POSTs /org-integrations/assign-scope verbatim', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  const payload = {
    orgId: 'org1',
    kind: 'supabase_project',
    slug: 'acme',
    fromScopeType: 'org',
    toScopeType: 'workspace',
    toScopeId: 'ws9'
  }

  await svc.assignOrgIntegrationScope(payload)

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/assign-scope', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(opts.body, payload, 'body verbatim')
  sandbox.restore()
  t.end()
})

test('reorderOrgIntegrations POSTs /org-integrations/reorder verbatim', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  const payload = { orgId: 'org1', kind: 'supabase_project', slugs: ['a', 'b', 'c'] }

  await svc.reorderOrgIntegrations(payload)

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/reorder', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(opts.body, payload, 'body carries the ordered slugs array')
  sandbox.restore()
  t.end()
})

test('assignOrgIntegrationScope / reorderOrgIntegrations validate orgId + kind', t => {
  t.plan(4)
  const svc = makeService()
  t.throws(() => svc.assignOrgIntegrationScope({ kind: 'k' }), /orgId is required/)
  t.throws(() => svc.assignOrgIntegrationScope({ orgId: 'o' }), /kind is required/)
  t.throws(() => svc.reorderOrgIntegrations({ kind: 'k' }), /orgId is required/)
  t.throws(() => svc.reorderOrgIntegrations({ orgId: 'o' }), /kind is required/)
  sandbox.restore()
  t.end()
})

// ─── listOrgIntegrationKinds — GET, no args ──────────────────────────────────

test('listOrgIntegrationKinds GETs /org-integrations/kinds', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ kinds: [] })

  await svc.listOrgIntegrationKinds()

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/kinds', 'URL matches')
  t.equal(opts, undefined, 'GET — no options bag')
  sandbox.restore()
  t.end()
})

test('listOrgIntegrationKinds returns the bare { kinds } payload verbatim', async t => {
  t.plan(1)
  const svc = makeService()
  const kinds = [{ kind: 'supabase_project', label: 'Supabase' }]
  sandbox.stub(svc, '_request').resolves({ kinds })

  const result = await svc.listOrgIntegrationKinds()

  t.deepEqual(result, { kinds }, 'bare payload passes through _call untouched')
  sandbox.restore()
  t.end()
})

// ─── envelope contract — _call unwraps { success, data } when present ─────────

test('org-integration methods unwrap the { success, data } envelope when the server sends one', async t => {
  t.plan(1)
  const svc = makeService()
  const data = { items: [{ kind: 'github' }] }
  sandbox.stub(svc, '_request').resolves({ success: true, data, message: 'ok' })

  const result = await svc.listOrgIntegrations({ orgId: 'org1' })

  t.deepEqual(result, data, 'envelope.data surfaces when success:true')
  sandbox.restore()
  t.end()
})

test('org-integration methods throw the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'Insufficient organization role' })

  try {
    await svc.upsertOrgIntegration({ orgId: 'org1', kind: 'supabase_project' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Insufficient organization role', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})
