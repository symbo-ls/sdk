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

// resendVerification + verifyEmail ------------------------------------------

test('resendVerification POSTs to /auth/resend-verification', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { queued: true } })
  await svc.resendVerification()
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/resend-verification', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('verifyEmail GETs /auth/verify-email/:token (url-encoded)', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { verified: true } })
  await svc.verifyEmail('abc/def 123')
  t.equal(
    requestStub.firstCall.args[0],
    '/auth/verify-email/abc%2Fdef%20123',
    'token percent-encoded'
  )
  sandbox.restore()
  t.end()
})

test('verifyEmail throws without token', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.verifyEmail('') } catch (err) {
    t.equal(err.message, 'token is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// getOrgMemberRoles ---------------------------------------------------------

test('getOrgMemberRoles hits /auth/org/:orgId/member-roles with GET', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { members: [{ email: 'a@b.co', role: 'owner' }, { email: 'c@d.co', role: 'editor' }] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getOrgMemberRoles('o1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/auth/org/o1/member-roles', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, payload, 'returns members envelope')
  sandbox.restore()
  t.end()
})

test('getOrgMemberRoles url-encodes orgId', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { members: [] } })
  await svc.getOrgMemberRoles('org with spaces')
  t.equal(
    requestStub.firstCall.args[0],
    '/auth/org/org%20with%20spaces/member-roles',
    'orgId percent-encoded'
  )
  sandbox.restore()
  t.end()
})

test('getOrgMemberRoles fails-soft to { members: [] } on non-success', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.getOrgMemberRoles('o1')
  t.deepEqual(result, { members: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

test('getOrgMemberRoles throws without orgId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getOrgMemberRoles('') } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
