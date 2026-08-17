import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getProjectByKey — MODULE-CHANNEL-PIN-1: workspaceId query param ---------

test('getProjectByKey — no options hits /projects/key/:path with no query (backward-compatible)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.getProjectByKey('my-project')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/key/my-project', 'URL has no query string')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getProjectByKey — {owner, key} spec still resolves the 2-seg path with no query', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.getProjectByKey({ owner: 'nika', key: 'bellforge' })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/nika/bellforge',
    'URL is the collision-safe 2-seg route, no query string'
  )
  sandbox.restore()
  t.end()
})

test('getProjectByKey — workspaceId option appends ?workspaceId= query param', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.getProjectByKey('my-project', {
    workspaceId: '507f1f77bcf86cd799439011'
  })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/my-project?workspaceId=507f1f77bcf86cd799439011',
    'workspaceId is appended as a query param'
  )
  sandbox.restore()
  t.end()
})

test('getProjectByKey — workspaceId option is coerced to a String', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.getProjectByKey('my-project', { workspaceId: 12345 })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/my-project?workspaceId=12345',
    'numeric workspaceId is stringified'
  )
  sandbox.restore()
  t.end()
})

test('getProjectByKey — falsy workspaceId does not append a query string', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.getProjectByKey('my-project', { workspaceId: '' })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/my-project',
    'empty-string workspaceId is treated as absent'
  )
  sandbox.restore()
  t.end()
})

// listEnvironments — MODULE-CHANNEL-PIN-1: workspaceId query param --------

test('listEnvironments — no options hits /projects/:id/environments with no query (backward-compatible)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { environments: {} } })
  await svc.listEnvironments('proj123')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/proj123/environments', 'URL has no query string')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('listEnvironments — headers option is still forwarded unchanged', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.listEnvironments('proj123', { headers: { 'X-Test': '1' } })
  t.deepEqual(
    requestStub.firstCall.args[1].headers,
    { 'X-Test': '1' },
    'headers pass through'
  )
  sandbox.restore()
  t.end()
})

test('listEnvironments — workspaceId option appends ?workspaceId= query param', async (t) => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.listEnvironments('proj123', {
    workspaceId: '507f1f77bcf86cd799439011'
  })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/proj123/environments?workspaceId=507f1f77bcf86cd799439011',
    'workspaceId is appended as a query param'
  )
  sandbox.restore()
  t.end()
})

test('listEnvironments — workspaceId + headers combine correctly', async (t) => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: {} })
  await svc.listEnvironments('proj123', {
    workspaceId: 'ws1',
    headers: { A: '1' }
  })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/projects/proj123/environments?workspaceId=ws1',
    'URL carries workspaceId'
  )
  t.deepEqual(opts.headers, { A: '1' }, 'headers still forwarded')
  sandbox.restore()
  t.end()
})

test('listEnvironments — throws without projectId', async (t) => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.listEnvironments()
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'Project ID is required', 'throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
