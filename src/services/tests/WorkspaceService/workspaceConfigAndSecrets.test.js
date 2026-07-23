import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const service = new WorkspaceService()
  sandbox.stub(service, '_requireReady').resolves()
  return service
}

test('workspace config and secret methods are flat-exposed by the SDK', t => {
  t.plan(6)
  for (const method of [
    'getWorkspacePublicConfig',
    'upsertWorkspacePublicConfig',
    'deleteWorkspacePublicConfig',
    'listWorkspaceSecrets',
    'upsertWorkspaceSecret',
    'deleteWorkspaceSecret'
  ]) {
    t.equal(SERVICE_METHODS[method], 'workspace', `${method} maps to WorkspaceService`)
  }
})

test('getWorkspacePublicConfig lists public config for an encoded envKey alias', async t => {
  t.plan(3)
  const service = makeService()
  const data = { environment: 'preview/us', config: { PUBLIC_URL: 'https://example.test' } }
  const request = sandbox.stub(service, '_request').resolves({ success: true, data })

  const result = await service.getWorkspacePublicConfig('workspace-1', { envKey: 'preview/us' })

  t.equal(request.firstCall.args[0], '/workspaces/workspace-1/config/public?environment=preview%2Fus')
  t.equal(request.firstCall.args[1].method, 'GET')
  t.deepEqual(result, data)
  sandbox.restore()
})

test('upsertWorkspacePublicConfig sends the complete public config input', async t => {
  t.plan(3)
  const service = makeService()
  const input = {
    environmentKey: 'production',
    key: 'PUBLIC_URL',
    value: 'https://example.test',
    description: 'Public API URL'
  }
  const request = sandbox.stub(service, '_request').resolves({ success: true, data: input })

  await service.upsertWorkspacePublicConfig('workspace-1', input)

  t.equal(request.firstCall.args[0], '/workspaces/workspace-1/config/public')
  t.equal(request.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(request.firstCall.args[1].body), {
    key: input.key,
    value: input.value,
    description: input.description,
    environment: 'production'
  })
  sandbox.restore()
})

test('deleteWorkspacePublicConfig encodes the key and environment', async t => {
  t.plan(2)
  const service = makeService()
  const request = sandbox.stub(service, '_request').resolves({ success: true, data: { deleted: true } })

  await service.deleteWorkspacePublicConfig('workspace-1', 'PUBLIC/URL', { environment: 'preview/us' })

  t.equal(
    request.firstCall.args[0],
    '/workspaces/workspace-1/config/public/PUBLIC%2FURL?environment=preview%2Fus'
  )
  t.equal(request.firstCall.args[1].method, 'DELETE')
  sandbox.restore()
})

test('listWorkspaceSecrets returns metadata for an environment', async t => {
  t.plan(3)
  const service = makeService()
  const data = {
    environment: 'production',
    secrets: [{ key: 'API_KEY', canReadValue: false }]
  }
  const request = sandbox.stub(service, '_request').resolves({ success: true, data })

  const result = await service.listWorkspaceSecrets('workspace-1', { environment: 'production' })

  t.equal(request.firstCall.args[0], '/workspaces/workspace-1/secrets?environment=production')
  t.equal(request.firstCall.args[1].method, 'GET')
  t.deepEqual(result, data)
  sandbox.restore()
})

test('upsertWorkspaceSecret writes value and allowed consumers without adding a read API', async t => {
  t.plan(4)
  const service = makeService()
  const input = {
    env: 'production',
    key: 'API_KEY',
    value: 'write-only-value',
    description: 'Backend API key',
    allowedConsumers: [{ type: 'function', id: 'sync-users' }]
  }
  const metadata = {
    key: input.key,
    environment: 'production',
    canReadValue: false,
    allowedConsumers: input.allowedConsumers
  }
  const request = sandbox.stub(service, '_request').resolves({ success: true, data: metadata })

  const result = await service.upsertWorkspaceSecret('workspace-1', input)

  t.equal(request.firstCall.args[0], '/workspaces/workspace-1/secrets')
  t.equal(request.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(request.firstCall.args[1].body), {
    key: input.key,
    value: input.value,
    description: input.description,
    allowedConsumers: input.allowedConsumers,
    environment: 'production'
  })
  t.deepEqual(result, metadata)
  sandbox.restore()
})

test('deleteWorkspaceSecret encodes the key and environment', async t => {
  t.plan(2)
  const service = makeService()
  const request = sandbox.stub(service, '_request').resolves({ success: true, data: { deleted: true } })

  await service.deleteWorkspaceSecret('workspace-1', 'API/KEY', { environment: 'preview/us' })

  t.equal(
    request.firstCall.args[0],
    '/workspaces/workspace-1/secrets/API%2FKEY?environment=preview%2Fus'
  )
  t.equal(request.firstCall.args[1].method, 'DELETE')
  sandbox.restore()
})

test('workspace config methods reject missing scope before making requests', async t => {
  t.plan(7)
  const service = makeService()
  const request = sandbox.stub(service, '_request')
  const cases = [
    () => service.getWorkspacePublicConfig('', { environment: 'production' }),
    () => service.getWorkspacePublicConfig('workspace-1'),
    () => service.upsertWorkspacePublicConfig('workspace-1', { environment: 'production', key: 'A' }),
    () => service.deleteWorkspacePublicConfig('workspace-1', '', { environment: 'production' }),
    () => service.listWorkspaceSecrets('workspace-1'),
    () => service.upsertWorkspaceSecret('workspace-1', {
      environment: 'production',
      key: 'API_KEY',
      value: 'secret',
      allowedConsumers: []
    })
  ]

  for (const invoke of cases) {
    try {
      await invoke()
      t.fail('invalid input should be rejected')
    } catch (error) {
      t.ok(/required/.test(error.message), 'invalid input is rejected')
    }
  }
  t.equal(request.callCount, 0, 'no request is made for invalid input')
  sandbox.restore()
})

test('WorkspaceService does not expose trusted runtime secret resolution', t => {
  t.plan(2)
  t.equal(typeof WorkspaceService.prototype.resolveRuntimeSecrets, 'undefined')
  t.equal(SERVICE_METHODS.resolveRuntimeSecrets, undefined)
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
