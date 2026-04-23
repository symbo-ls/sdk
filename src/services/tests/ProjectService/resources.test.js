import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// id-based variants ----------------------------------------------------------

test('getProjectComponents hits /projects/:id/resources/components with GET', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [{ id: 'c1' }] })

  const result = await svc.getProjectComponents('proj123')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/proj123/resources/components', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, { success: true, data: [{ id: 'c1' }] }, 'returns raw response envelope')
  sandbox.restore()
  t.end()
})

test('getProjectFunctions hits /projects/:id/resources/functions', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectFunctions('proj123')
  t.equal(requestStub.firstCall.args[0], '/projects/proj123/resources/functions', 'URL matches')
  sandbox.restore()
  t.end()
})

test('getProjectPages hits /projects/:id/resources/pages', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectPages('proj123')
  t.equal(requestStub.firstCall.args[0], '/projects/proj123/resources/pages', 'URL matches')
  sandbox.restore()
  t.end()
})

test('getProjectComponents url-encodes projectId', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true })
  await svc.getProjectComponents('acme/weird id')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/acme%2Fweird%20id/resources/components',
    'special chars in projectId are percent-encoded'
  )
  sandbox.restore()
  t.end()
})

test('getProjectComponents throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getProjectComponents('')
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'projectId is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('getProjectFunctions throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getProjectFunctions()
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'projectId is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('getProjectPages throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getProjectPages(null)
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'projectId is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('getProjectComponents fails-soft to { items: [] } on non-success response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.getProjectComponents('proj123')
  t.deepEqual(result, { items: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

// key-based variants ---------------------------------------------------------

test('getProjectComponentsByKey hits /projects/key/:key/resources/components (bare string)', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectComponentsByKey('marketing')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/key/marketing/resources/components', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getProjectComponentsByKey accepts { owner, key } shape', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectComponentsByKey({ owner: 'acme', key: 'marketing' })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/acme/marketing/resources/components',
    'URL uses owner/key; server 1-seg today, 2-seg on the way'
  )
  sandbox.restore()
  t.end()
})

test('getProjectFunctionsByKey hits /projects/key/:key/resources/functions', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectFunctionsByKey('marketing')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/marketing/resources/functions',
    'URL matches'
  )
  sandbox.restore()
  t.end()
})

test('getProjectPagesByKey hits /projects/key/:key/resources/pages', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getProjectPagesByKey('marketing')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/marketing/resources/pages',
    'URL matches'
  )
  sandbox.restore()
  t.end()
})

test('getProjectComponentsByKey throws without projectKey', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getProjectComponentsByKey()
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'projectKey is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('getProjectPagesByKey fails-soft to { items: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves(null)
  const result = await svc.getProjectPagesByKey('marketing')
  t.deepEqual(result, { items: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
