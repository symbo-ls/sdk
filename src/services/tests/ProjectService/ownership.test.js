import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// listProjectOwnership -------------------------------------------------------

test('listProjectOwnership — no params hits /projects/ownership (GET, no query)', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [], total: 0 } })
  await svc.listProjectOwnership()
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/ownership', 'URL is literal /projects/ownership')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('listProjectOwnership — with hasOwner + search appends query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [] } })
  await svc.listProjectOwnership({ hasOwner: 'false', search: 'acme', page: 2, limit: 25 })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/ownership?hasOwner=false&search=acme&page=2&limit=25',
    'URL has expected query params'
  )
  sandbox.restore()
  t.end()
})

test('listProjectOwnership — null-valued params are filtered out', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [] } })
  await svc.listProjectOwnership({ hasOwner: 'true', search: null, page: undefined })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/ownership?hasOwner=true',
    'null / undefined values are dropped'
  )
  sandbox.restore()
  t.end()
})

test('listProjectOwnership — fails-soft envelope on non-success', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.listProjectOwnership()
  t.deepEqual(result, { success: false, data: { items: [], total: 0 } }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

// assignProjectOwner ---------------------------------------------------------

test('assignProjectOwner POSTs to /projects/ownership/assign with body', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { projectId: 'p1' } })
  await svc.assignProjectOwner({ projectId: 'p1', userId: 'u1' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/ownership/assign', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ projectId: 'p1', userId: 'u1' }), 'body is serialized args')
  sandbox.restore()
  t.end()
})

test('assignProjectOwner — projectKey + email is also accepted', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true })
  await svc.assignProjectOwner({ projectKey: 'marketing', email: 'owner@acme.co' })
  t.equal(
    requestStub.firstCall.args[1].body,
    JSON.stringify({ projectKey: 'marketing', email: 'owner@acme.co' }),
    'body carries projectKey + email'
  )
  sandbox.restore()
  t.end()
})

test('assignProjectOwner throws without project identifier', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.assignProjectOwner({ userId: 'u1' })
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'projectId or projectKey is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('assignProjectOwner throws without user identifier', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.assignProjectOwner({ projectId: 'p1' })
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'userId or email is required', 'Throws validation error')
  }
  sandbox.restore()
  t.end()
})

test('assignProjectOwner throws on failed server response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'forbidden' })
  try {
    await svc.assignProjectOwner({ projectId: 'p1', userId: 'u1' })
    t.fail('expected throw')
  } catch (err) {
    t.equal(err.message, 'forbidden', 'Throws server message')
  }
  sandbox.restore()
  t.end()
})

// autoAssignProjectOwners ----------------------------------------------------

test('autoAssignProjectOwners POSTs to /projects/ownership/auto-assign', async t => {
  t.plan(3)
  const svc = makeService()
  const counts = { processed: 5, updated: 3, skipped: 2, errors: [] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: counts })
  const result = await svc.autoAssignProjectOwners({ limit: 50 })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/projects/ownership/auto-assign', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(result, counts, 'returns unwrapped data (counts)')
  sandbox.restore()
  t.end()
})

test('autoAssignProjectOwners — no args still POSTs with empty body object', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.autoAssignProjectOwners()
  t.equal(requestStub.firstCall.args[1].body, '{}', 'body is `{}` when no args passed')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
