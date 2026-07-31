import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the 'marketplace.integrations' entity —
// install/uninstall/entitlement lifecycle (CU-INT §180), distinct from
// 'marketplace.listings' (project-template marketplace) and 'orgIntegration'
// (connect/grant/scope CRUD). Verifies each op resolves the right
// IntegrationService method with the right positional args, for both the
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

test('marketplace.integrations.list → integration.listMarketplaceEntitlements(workspaceId, { status })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('marketplace.integrations', 'list', { workspaceId: 'ws9', status: 'active,trialing' })

  t.deepEqual(calls[0], {
    service: 'integration',
    method: 'listMarketplaceEntitlements',
    args: ['ws9', { status: 'active,trialing' }]
  })
  t.end()
})

test('marketplace.integrations.list tolerates the declarative fetch-adapter pack ({ params })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('marketplace.integrations', 'list', { params: { workspaceId: 'ws9' } })

  t.deepEqual(calls[0].args, ['ws9', { status: undefined }], 'workspaceId resolves from params pack')
  t.end()
})

test('marketplace.integrations.get → integration.checkMarketplaceEntitlement({ workspaceId, kind })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('marketplace.integrations', 'get', { workspaceId: 'ws9', kind: 'stripe-billing' })

  t.equal(calls[0].method, 'checkMarketplaceEntitlement', 'routes to checkMarketplaceEntitlement')
  t.equal(calls[0].args[0].workspaceId, 'ws9', 'workspaceId resolves')
  t.equal(calls[0].args[0].kind, 'stripe-billing', 'kind resolves')
  t.end()
})

test('marketplace.integrations.get tolerates the declarative fetch-adapter pack ({ filter })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('marketplace.integrations', 'get', { filter: { workspaceId: 'ws9', kind: 'stripe-billing' } })

  t.equal(calls[0].args[0].workspaceId, 'ws9', 'workspaceId resolves from filter pack')
  t.equal(calls[0].args[0].kind, 'stripe-billing', 'kind resolves from filter pack')
  t.end()
})

test('marketplace.integrations.create → integration.installMarketplaceIntegration with the bare payload', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  const payload = { orgId: 'org1', workspaceId: 'ws9', kind: 'webhook' }
  await execute('marketplace.integrations', 'create', payload)

  t.equal(calls[0].method, 'installMarketplaceIntegration', 'routes to installMarketplaceIntegration')
  t.deepEqual(calls[0].args[0], payload, 'payload passes through as the single arg')
  t.end()
})

test('marketplace.integrations.remove → integration.uninstallMarketplaceIntegration with the bare payload', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  const payload = { orgId: 'org1', workspaceId: 'ws9', kind: 'webhook', cancelSubscription: false }
  await execute('marketplace.integrations', 'remove', payload)

  t.equal(calls[0].method, 'uninstallMarketplaceIntegration', 'routes to uninstallMarketplaceIntegration')
  t.deepEqual(calls[0].args[0], payload, 'payload passes through as the single arg')
  t.end()
})

test('marketplace.integrations rejects unsupported ops', t => {
  const execute = createEntityDispatcher(makeSdk([]))
  t.throws(
    () => execute('marketplace.integrations', 'update', { workspaceId: 'ws9' }),
    /does not support op 'update'/,
    'unregistered op throws with the supported-ops message'
  )
  t.end()
})

test("'marketplace.integrations' is distinct from 'marketplace.listings' and 'orgIntegration'", t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  t.doesNotThrow(
    () => execute('marketplace.integrations', 'list', { workspaceId: 'ws9' }),
    'marketplace.integrations is a registered entity distinct from the other two marketplace/integration surfaces'
  )
  t.end()
})
