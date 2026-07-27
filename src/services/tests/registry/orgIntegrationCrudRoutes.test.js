import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the org-integration management surface —
// 'orgIntegration' {list,upsert,remove,assignScope,reorder,kinds} →
// IntegrationService CRUD methods — and 'workspace.settings' update →
// WorkspaceService.updateWorkspaceSettings. Verifies each op resolves the
// right service method with the right positional args, for both the
// imperative caller shape and the declarative fetch-adapter pack ({ params }).

const makeSdk = (calls) => ({
  getService: (name) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string') return undefined
          return (...args) => {
            calls.push({ service: name, method, args })
            return Promise.resolve({ ok: true })
          }
        }
      }
    )
})

// ─── orgIntegration CRUD ─────────────────────────────────────────────────────

test('orgIntegration.list → integration.listOrgIntegrations with the resolved query bag', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration', 'list', { orgId: 'org1', scopeType: 'workspace', scopeId: 'ws9' })

  t.deepEqual(calls[0], {
    service: 'integration',
    method: 'listOrgIntegrations',
    args: [{ orgId: 'org1', scopeType: 'workspace', scopeId: 'ws9', includeParents: undefined }]
  })
  t.end()
})

test('orgIntegration.list tolerates the declarative fetch-adapter pack ({ params })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration', 'list', { params: { orgId: 'org1', includeParents: true } })

  const bag = calls[0].args[0]
  t.equal(bag.orgId, 'org1', 'orgId resolves from params pack')
  t.equal(bag.includeParents, true, 'includeParents resolves from params pack')
  t.end()
})

test('orgIntegration.upsert → integration.upsertOrgIntegration with the bare payload', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  const payload = {
    orgId: 'org1',
    kind: 'webhook',
    slug: 'acme',
    config: { tableAllowlist: { listings: ['select'] } }
  }
  await execute('orgIntegration', 'upsert', payload)

  t.equal(calls[0].method, 'upsertOrgIntegration', 'routes to upsertOrgIntegration')
  t.deepEqual(calls[0].args[0], payload, 'payload passes through as the single arg')
  t.end()
})

test('orgIntegration.upsert also accepts a nested { payload } shape', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  const payload = { orgId: 'org1', kind: 'github' }
  await execute('orgIntegration', 'upsert', { payload })

  t.deepEqual(calls[0].args[0], payload, '.payload is unwrapped by argMaps.payload')
  t.end()
})

test('orgIntegration.remove → integration.deleteOrgIntegration with the scope key', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration', 'remove', {
    orgId: 'org1',
    kind: 'webhook',
    slug: 'acme',
    scopeType: 'workspace',
    scopeId: 'ws9'
  })

  t.equal(calls[0].method, 'deleteOrgIntegration', 'routes to deleteOrgIntegration')
  t.deepEqual(calls[0].args[0], {
    orgId: 'org1',
    kind: 'webhook',
    slug: 'acme',
    scopeType: 'workspace',
    scopeId: 'ws9'
  })
  t.end()
})

test('orgIntegration.assignScope + reorder route to their methods with the payload', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration', 'assignScope', {
    orgId: 'org1',
    kind: 'webhook',
    toScopeType: 'workspace',
    toScopeId: 'ws9'
  })
  await execute('orgIntegration', 'reorder', {
    orgId: 'org1',
    kind: 'webhook',
    slugs: ['a', 'b']
  })

  t.equal(calls[0].method, 'assignOrgIntegrationScope', 'assignScope → assignOrgIntegrationScope')
  t.equal(calls[0].args[0].toScopeType, 'workspace', 'assign payload passes through')
  t.equal(calls[1].method, 'reorderOrgIntegrations', 'reorder → reorderOrgIntegrations')
  t.deepEqual(calls[1].args[0].slugs, ['a', 'b'], 'reorder slugs pass through')
  t.end()
})

test('orgIntegration.kinds → integration.listOrgIntegrationKinds with no args', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration', 'kinds')

  t.equal(calls[0].method, 'listOrgIntegrationKinds', 'routes to listOrgIntegrationKinds')
  t.deepEqual(calls[0].args, [], 'no positional args')
  t.end()
})

test('orgIntegration rejects unsupported ops', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  t.throws(
    () => execute('orgIntegration', 'get', { orgId: 'org1' }),
    /does not support op 'get'/,
    'unregistered op throws with the supported-ops message'
  )
  t.end()
})

// ─── workspace.settings ──────────────────────────────────────────────────────

test('workspace.settings.update → workspace.updateWorkspaceSettings passes (id, partial)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('workspace.settings', 'update', {
    workspaceId: 'w1',
    navbar: [{ label: 'Home', path: '/' }],
    apps: []
  })

  t.deepEqual(calls[0], {
    service: 'workspace',
    method: 'updateWorkspaceSettings',
    args: ['w1', { navbar: [{ label: 'Home', path: '/' }], apps: [] }]
  })
  t.end()
})

test('workspace.settings.update strips id/workspaceId out of the partial', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('workspace.settings', 'update', { id: 'w1', designSystem: { canvasBg: 'gray.1' } })

  const [id, partial] = calls[0].args
  t.equal(id, 'w1', 'id resolves the workspace')
  t.deepEqual(partial, { designSystem: { canvasBg: 'gray.1' } }, 'id key not leaked into the partial')
  t.end()
})

test('workspace.settings.update accepts a nested { payload } partial', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('workspace.settings', 'update', {
    workspaceId: 'w1',
    payload: { workspaceModule: { owner: 'acme', key: 'workspace-module' } }
  })

  t.deepEqual(
    calls[0].args,
    ['w1', { workspaceModule: { owner: 'acme', key: 'workspace-module' } }],
    '.payload becomes the partial; workspaceId stays positional'
  )
  t.end()
})
