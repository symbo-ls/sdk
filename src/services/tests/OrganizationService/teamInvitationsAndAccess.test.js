import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// listTeamInvitations --------------------------------------------------------

test('listTeamInvitations hits /organizations/:orgId/teams/:teamId/invitations', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { invitations: [] } })
  await svc.listTeamInvitations('o1', 't1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/invitations', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('listTeamInvitations fails-soft to { invitations: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.listTeamInvitations('o1', 't1')
  t.deepEqual(result, { invitations: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

test('listTeamInvitations throws without args', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.listTeamInvitations('o1') } catch (err) {
    t.equal(err.message, 'orgId and teamId are required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// createTeamInvitation -------------------------------------------------------

test('createTeamInvitation POSTs email to .../invitations', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'inv1' } })
  await svc.createTeamInvitation('o1', 't1', { email: 'x@y.co', recipientName: 'X' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/invitations', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ email: 'x@y.co', recipientName: 'X' }), 'body has both fields')
  sandbox.restore()
  t.end()
})

test('createTeamInvitation omits recipientName when not passed', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.createTeamInvitation('o1', 't1', { email: 'x@y.co' })
  t.equal(requestStub.firstCall.args[1].body, JSON.stringify({ email: 'x@y.co' }), 'body has only email')
  sandbox.restore()
  t.end()
})

test('createTeamInvitation throws without email', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.createTeamInvitation('o1', 't1', {}) } catch (err) {
    t.equal(err.message, 'email is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// revokeTeamInvitation -------------------------------------------------------

test('revokeTeamInvitation POSTs to .../invitations/:inviteId/revoke', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { revoked: true } })
  await svc.revokeTeamInvitation('o1', 't1', 'inv9')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/invitations/inv9/revoke', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('revokeTeamInvitation throws without inviteId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.revokeTeamInvitation('o1', 't1', '') } catch (err) {
    t.equal(err.message, 'inviteId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// acceptTeamInvitation -------------------------------------------------------

test('acceptTeamInvitation POSTs token to /organizations/accept-team-invitation', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { joined: true } })
  await svc.acceptTeamInvitation({ token: 'signed.jwt.token' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/accept-team-invitation', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ token: 'signed.jwt.token' }), 'body carries token')
  sandbox.restore()
  t.end()
})

test('acceptTeamInvitation throws without token', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.acceptTeamInvitation() } catch (err) {
    t.equal(err.message, 'token is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// listTeamWorkspaceAccess ----------------------------------------------------

test('listTeamWorkspaceAccess hits .../workspace-access with GET', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { grants: [] } })
  await svc.listTeamWorkspaceAccess('o1', 't1')
  t.equal(
    requestStub.firstCall.args[0],
    '/organizations/o1/teams/t1/workspace-access',
    'URL matches'
  )
  sandbox.restore()
  t.end()
})

test('listTeamWorkspaceAccess fails-soft to { grants: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves(null)
  const result = await svc.listTeamWorkspaceAccess('o1', 't1')
  t.deepEqual(result, { grants: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

// grantTeamWorkspaceAccess ---------------------------------------------------

test('grantTeamWorkspaceAccess POSTs workspace + role', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'a1' } })
  await svc.grantTeamWorkspaceAccess('o1', 't1', { workspaceId: 'w1', role: 'editor' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/workspace-access', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ workspaceId: 'w1', role: 'editor' }), 'body carries both')
  sandbox.restore()
  t.end()
})

test('grantTeamWorkspaceAccess defaults role to guest', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.grantTeamWorkspaceAccess('o1', 't1', { workspaceId: 'w1' })
  t.equal(requestStub.firstCall.args[1].body, JSON.stringify({ workspaceId: 'w1', role: 'guest' }), 'role defaults to guest')
  sandbox.restore()
  t.end()
})

test('grantTeamWorkspaceAccess throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.grantTeamWorkspaceAccess('o1', 't1', {}) } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// updateTeamWorkspaceAccess --------------------------------------------------

test('updateTeamWorkspaceAccess PATCHes /.../workspace-access/:accessId', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.updateTeamWorkspaceAccess('o1', 't1', 'a1', { role: 'maintainer' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/workspace-access/a1', 'URL matches')
  t.equal(opts.method, 'PATCH', 'method PATCH')
  t.equal(opts.body, JSON.stringify({ role: 'maintainer' }), 'body carries role')
  sandbox.restore()
  t.end()
})

test('updateTeamWorkspaceAccess throws without role', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.updateTeamWorkspaceAccess('o1', 't1', 'a1', {}) } catch (err) {
    t.equal(err.message, 'role is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('updateTeamWorkspaceAccess throws without accessId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.updateTeamWorkspaceAccess('o1', 't1', '', { role: 'r' }) } catch (err) {
    t.equal(err.message, 'orgId, teamId and accessId are required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// revokeTeamWorkspaceAccess --------------------------------------------------

test('revokeTeamWorkspaceAccess DELETEs /.../workspace-access/:accessId', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.revokeTeamWorkspaceAccess('o1', 't1', 'a1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/teams/t1/workspace-access/a1', 'URL matches')
  t.equal(opts.method, 'DELETE', 'method DELETE')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
