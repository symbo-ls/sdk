import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// listOrgRoles ---------------------------------------------------------------

test('listOrgRoles hits /organizations/:orgId/roles with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = [{ key: 'owner', name: 'Owner', isBuiltin: true }]
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.listOrgRoles('org1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/roles', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('listOrgRoles throws without orgId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.listOrgRoles() } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation error')
  }
  sandbox.restore()
  t.end()
})

// createOrgRole --------------------------------------------------------------

test('createOrgRole POSTs body to /organizations/:orgId/roles', async t => {
  t.plan(3)
  const svc = makeService()
  const role = { key: 'qa', name: 'QA Tester', baseTier: 'member', additionalPermissions: ['team.read'] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: role })
  await svc.createOrgRole('org1', role)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/roles', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify(role), 'body is serialized role')
  sandbox.restore()
  t.end()
})

test('createOrgRole throws when required fields missing', async t => {
  t.plan(3)
  const svc = makeService()
  try { await svc.createOrgRole('org1', { name: 'X', baseTier: 'member' }) } catch (err) {
    t.equal(err.message, 'role.key is required', 'missing key caught')
  }
  try { await svc.createOrgRole('org1', { key: 'x', baseTier: 'member' }) } catch (err) {
    t.equal(err.message, 'role.name is required', 'missing name caught')
  }
  try { await svc.createOrgRole('org1', { key: 'x', name: 'X' }) } catch (err) {
    t.equal(err.message, 'role.baseTier is required', 'missing baseTier caught')
  }
  sandbox.restore()
  t.end()
})

test('createOrgRole throws on failed server response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'key_taken' })
  try {
    await svc.createOrgRole('org1', { key: 'qa', name: 'QA', baseTier: 'member' })
  } catch (err) {
    t.equal(err.message, 'key_taken', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

// updateOrgRole --------------------------------------------------------------

test('updateOrgRole PATCHes /organizations/:orgId/roles/:roleKey', async t => {
  t.plan(3)
  const svc = makeService()
  const updates = { name: 'QA Engineer' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { key: 'qa', name: 'QA Engineer' } })
  await svc.updateOrgRole('org1', 'qa', updates)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/roles/qa', 'URL matches')
  t.equal(opts.method, 'PATCH', 'method PATCH')
  t.equal(opts.body, JSON.stringify(updates), 'body carries updates')
  sandbox.restore()
  t.end()
})

test('updateOrgRole url-encodes roleKey', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.updateOrgRole('org1', 'my role!', { name: 'X' })
  t.equal(
    requestStub.firstCall.args[0],
    '/organizations/org1/roles/my%20role!',
    'roleKey is percent-encoded'
  )
  sandbox.restore()
  t.end()
})

test('updateOrgRole throws on empty updates', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.updateOrgRole('org1', 'qa', {}) } catch (err) {
    t.equal(err.message, 'updates cannot be empty', 'rejects noop')
  }
  sandbox.restore()
  t.end()
})

// deleteOrgRole --------------------------------------------------------------

test('deleteOrgRole DELETEs /organizations/:orgId/roles/:roleKey', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { reassigned: 3 } })
  await svc.deleteOrgRole('org1', 'qa')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/roles/qa', 'URL matches')
  t.equal(opts.method, 'DELETE', 'method DELETE')
  sandbox.restore()
  t.end()
})

test('deleteOrgRole throws without roleKey', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.deleteOrgRole('org1', '') } catch (err) {
    t.equal(err.message, 'roleKey is required', 'validation error')
  }
  sandbox.restore()
  t.end()
})

// getMemberEffectiveRole -----------------------------------------------------

test('getMemberEffectiveRole hits /organizations/:orgId/members/:memberId/effective-role', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { role: 'qa', baseTier: 'member', permissions: ['team.read'], isBuiltin: false, source: 'custom' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getMemberEffectiveRole('org1', 'mem9')
  t.equal(
    requestStub.firstCall.args[0],
    '/organizations/org1/members/mem9/effective-role',
    'URL matches'
  )
  t.deepEqual(result, payload, 'returns data envelope')
  sandbox.restore()
  t.end()
})

test('getMemberEffectiveRole throws without memberId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getMemberEffectiveRole('org1') } catch (err) {
    t.equal(err.message, 'memberId is required', 'validation error')
  }
  sandbox.restore()
  t.end()
})

// listOrgPayments ------------------------------------------------------------

test('listOrgPayments hits /organizations/:orgId/payments with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { payments: [{ id: 'pay1', amount: 4200, status: 'paid' }], total: 1 }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.listOrgPayments('org1')
  t.equal(requestStub.firstCall.args[0], '/organizations/org1/payments', 'URL matches')
  t.deepEqual(result, payload, 'returns data')
  sandbox.restore()
  t.end()
})

test('listOrgPayments fails-soft to { payments: [] } on non-success', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.listOrgPayments('org1')
  t.deepEqual(result, { payments: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
