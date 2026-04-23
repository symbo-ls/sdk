import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('getMe — no session option hits literal /auth/me', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'u1' } })
  sandbox.stub(svc, '_resolvePluginSession').returns(null)

  const result = await svc.getMe()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/me', 'URL is literal /auth/me')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, { id: 'u1' }, 'returns response.data')

  sandbox.restore()
  t.end()
})

test('getMe — with plugin session encodes session into query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  sandbox.stub(svc, '_resolvePluginSession').returns('abc def')

  await svc.getMe({ session: 'ignored — resolver returns "abc def"' })

  const [endpoint] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/auth/me?session=abc%20def',
    'URL is /auth/me?session=<encoded>'
  )
  sandbox.restore()
  t.end()
})

test('getMyProjects hits /auth/me/projects with GET', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { projects: [{ id: 'p1', name: 'demo' }], total: 1 }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })

  const result = await svc.getMyProjects()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/me/projects', 'URL is literal /auth/me/projects')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, payload, 'returns response.data')

  sandbox.restore()
  t.end()
})

test('getMyProjects fails-soft to { projects: [] } on non-success response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'down' })

  const result = await svc.getMyProjects()
  t.deepEqual(result, { projects: [] }, 'fails-soft envelope')

  sandbox.restore()
  t.end()
})

test('getMyTeams hits /auth/me/teams with GET', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { teams: [{ id: 't1', name: 'platform', organization: 'o1', type: 'team', role: 'member' }] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })

  const result = await svc.getMyTeams()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/me/teams', 'URL is literal /auth/me/teams')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, payload, 'returns response.data')

  sandbox.restore()
  t.end()
})

test('getMyTeams fails-soft to { teams: [] } on missing success flag', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves(null)

  const result = await svc.getMyTeams()
  t.deepEqual(result, { teams: [] }, 'fails-soft envelope')

  sandbox.restore()
  t.end()
})

test('getMyOrgMemberships hits /auth/me/org-memberships with GET', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { memberships: [{ orgId: 'o1', role: 'owner', isOwner: true }] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })

  const result = await svc.getMyOrgMemberships()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/me/org-memberships', 'URL is literal /auth/me/org-memberships')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, payload, 'returns response.data')

  sandbox.restore()
  t.end()
})

test('getMyOrgMemberships fails-soft to { memberships: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })

  const result = await svc.getMyOrgMemberships()
  t.deepEqual(result, { memberships: [] }, 'fails-soft envelope')

  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
