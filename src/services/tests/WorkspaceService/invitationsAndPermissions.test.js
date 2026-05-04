import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getWorkspacePermissions ----------------------------------------------------

test('getWorkspacePermissions hits /workspaces/:workspaceId/permissions', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { role: 'owner', permissions: [] } })
  await svc.getWorkspacePermissions('w1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/permissions', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getWorkspacePermissions throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getWorkspacePermissions() } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// createWorkspaceProject -----------------------------------------------------

test('createWorkspaceProject POSTs to /workspaces/:workspaceId/projects', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { _id: 'p1' } })
  const projectData = { name: 'demo', projectType: 'app' }
  await svc.createWorkspaceProject('w1', projectData)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/projects', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify(projectData), 'body serialized')
  sandbox.restore()
  t.end()
})

// listWorkspaceInvitations ---------------------------------------------------

test('listWorkspaceInvitations hits /workspaces/:workspaceId/invitations with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { items: [] } })
  await svc.listWorkspaceInvitations('w1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/invitations', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

// createWorkspaceInvitation --------------------------------------------------

test('createWorkspaceInvitation POSTs email + role to /workspaces/:workspaceId/invitations', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.createWorkspaceInvitation('w1', { email: 'x@y.co', role: 'admin', recipientName: 'X' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/invitations', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(
    opts.body,
    JSON.stringify({ email: 'x@y.co', role: 'admin', recipientName: 'X' }),
    'body carries all three fields'
  )
  sandbox.restore()
  t.end()
})

test('createWorkspaceInvitation defaults role to editor; omits recipientName', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.createWorkspaceInvitation('w1', { email: 'x@y.co' })
  t.equal(
    requestStub.firstCall.args[1].body,
    JSON.stringify({ email: 'x@y.co', role: 'editor' }),
    'defaults role + omits missing recipientName'
  )
  sandbox.restore()
  t.end()
})

test('createWorkspaceInvitation throws without email', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.createWorkspaceInvitation('w1', {}) } catch (err) {
    t.equal(err.message, 'email is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// revokeWorkspaceInvitation --------------------------------------------------

test('revokeWorkspaceInvitation POSTs to .../invitations/:inviteId/revoke', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.revokeWorkspaceInvitation('w1', 'inv9')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/invitations/inv9/revoke', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('revokeWorkspaceInvitation throws without inviteId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.revokeWorkspaceInvitation('w1', '') } catch (err) {
    t.equal(err.message, 'inviteId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// acceptWorkspaceInvitation --------------------------------------------------

test('acceptWorkspaceInvitation POSTs token to /workspaces/accept-invitation', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { joined: true } })
  await svc.acceptWorkspaceInvitation({ token: 'signed.jwt' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/accept-invitation', 'URL matches (no workspaceId path param)')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ token: 'signed.jwt' }), 'body carries token')
  sandbox.restore()
  t.end()
})

test('acceptWorkspaceInvitation throws without token', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.acceptWorkspaceInvitation() } catch (err) {
    t.equal(err.message, 'token is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
