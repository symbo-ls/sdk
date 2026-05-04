import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// adminListOrganizations (drift-inline regression) ---------------------------

test('adminListOrganizations — no params hits /organizations/admin (literal)', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.adminListOrganizations()
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/admin', 'URL is literal /organizations/admin')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('adminListOrganizations — with params appends query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.adminListOrganizations({ status: 'active', page: 2, limit: 25 })
  t.equal(
    requestStub.firstCall.args[0],
    '/organizations/admin?status=active&page=2&limit=25',
    'URL has expected query params'
  )
  sandbox.restore()
  t.end()
})

// adminListAllTeams ----------------------------------------------------------

test('adminListAllTeams hits /organizations/:orgId/teams/admin/all', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { teams: [{ _id: 't1', name: 'confidential', isolation: 'confidential' }] }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.adminListAllTeams('org9')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org9/teams/admin/all', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('adminListAllTeams fails-soft to { teams: [] }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false })
  const result = await svc.adminListAllTeams('org9')
  t.deepEqual(result, { teams: [] }, 'fails-soft envelope')
  sandbox.restore()
  t.end()
})

test('adminListAllTeams throws without orgId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.adminListAllTeams() } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// adminOverrideTeam ----------------------------------------------------------

test('adminOverrideTeam POSTs to .../teams/:teamId/admin-override', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { elevated: true } })
  await svc.adminOverrideTeam('org9', 't1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org9/teams/t1/admin-override', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

test('adminOverrideTeam throws without teamId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.adminOverrideTeam('org9') } catch (err) {
    t.equal(err.message, 'orgId and teamId are required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('adminOverrideTeam throws on failed server response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'not_confidential' })
  try {
    await svc.adminOverrideTeam('org9', 't1')
  } catch (err) {
    t.equal(err.message, 'not_confidential', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

// ensureOrgStripeCustomer ----------------------------------------------------

test('ensureOrgStripeCustomer POSTs to /organizations/:orgId/stripe/customer', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = { orgId: 'org9', stripeCustomerId: 'cus_abc', created: true }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.ensureOrgStripeCustomer('org9')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org9/stripe/customer', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(result, payload, 'returns data envelope')
  sandbox.restore()
  t.end()
})

test('ensureOrgStripeCustomer throws without orgId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.ensureOrgStripeCustomer('') } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
