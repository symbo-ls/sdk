import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// deleteOrganization — default (soft, no dryRun) ---------------------------

test('deleteOrganization soft mode hits /organizations/:orgId with DELETE (no qs)', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { _id: 'org1', status: 'deleted' }
  })
  const result = await svc.deleteOrganization('org1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1', 'URL has no query string for default soft mode')
  t.equal(opts.method, 'DELETE', 'method DELETE')
  sandbox.restore()
  t.end()
})

test('deleteOrganization returns { ok, deleted, mode, dryRun, data } on success', async t => {
  t.plan(4)
  const svc = makeService()
  const orgData = { _id: 'org1', status: 'deleted' }
  sandbox.stub(svc, '_request').resolves({ success: true, data: orgData })
  const result = await svc.deleteOrganization('org1')
  t.equal(result.ok, true, 'ok=true')
  t.equal(result.deleted, true, 'deleted=true')
  t.equal(result.mode, 'soft', 'mode defaults to soft')
  t.equal(result.dryRun, false, 'dryRun=false')
  sandbox.restore()
  t.end()
})

// deleteOrganization — hard mode -------------------------------------------

test('deleteOrganization hard mode appends ?mode=hard to URL', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { _id: 'org1', status: 'deleted' }
  })
  await svc.deleteOrganization('org1', { mode: 'hard' })
  t.ok(
    requestStub.firstCall.args[0].includes('mode=hard'),
    'URL includes mode=hard query param'
  )
  sandbox.restore()
  t.end()
})

// deleteOrganization — dryRun ----------------------------------------------

test('deleteOrganization dryRun=true appends ?dryRun=true to URL', async t => {
  t.plan(2)
  const svc = makeService()
  const dryRunPlanData = {
    mongo: { orgMembers: 3, teams: 1 },
    projects: ['proj-a'],
    members: 3,
    durationMs: 10
  }
  const requestStub = sandbox.stub(svc, '_request').resolves(dryRunPlanData)
  const result = await svc.deleteOrganization('org1', { mode: 'hard', dryRun: true })
  const url = requestStub.firstCall.args[0]
  t.ok(url.includes('mode=hard') && url.includes('dryRun=true'), 'URL includes both params')
  t.equal(result.dryRun, true, 'result.dryRun=true')
  sandbox.restore()
  t.end()
})

test('deleteOrganization dryRun returns { ok, deleted:false, dryRunPlan }', async t => {
  t.plan(3)
  const svc = makeService()
  const serverPayload = { mongo: { orgMembers: 5 }, projects: ['p1', 'p2'], members: 5, durationMs: 8 }
  sandbox.stub(svc, '_request').resolves(serverPayload)
  const result = await svc.deleteOrganization('org1', { mode: 'hard', dryRun: true })
  t.equal(result.ok, true, 'ok=true')
  t.equal(result.deleted, false, 'deleted=false in dry-run')
  t.ok(result.dryRunPlan, 'dryRunPlan is present')
  sandbox.restore()
  t.end()
})

// deleteOrganization — cascade (reserved) ----------------------------------

test('deleteOrganization accepts cascade option without throwing', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true, data: { status: 'deleted' } })
  // cascade is accepted but not yet forwarded to server (TODO(server-4588))
  const result = await svc.deleteOrganization('org1', { cascade: false })
  t.equal(result.ok, true, 'cascade option accepted without error')
  sandbox.restore()
  t.end()
})

// deleteOrganization — error handling --------------------------------------

test('deleteOrganization throws when orgId is missing', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.deleteOrganization()
  } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation error')
  }
  sandbox.restore()
  t.end()
})

test('deleteOrganization returns { ok:false } on server error response', async t => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, error: 'forbidden', message: 'Hard delete requires root admin privileges.' })
  const result = await svc.deleteOrganization('org1', { mode: 'hard' })
  t.equal(result.ok, false, 'ok=false on server error')
  t.ok(result.error, 'error field is present')
  sandbox.restore()
  t.end()
})

test('deleteOrganization throws on success:false with no error field', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'org_not_found' })
  try {
    await svc.deleteOrganization('org1')
  } catch (err) {
    t.equal(err.message, 'org_not_found', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

// Backwards-compat: existing callers with no opts still work ---------------

test('deleteOrganization called with no opts uses soft defaults', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { status: 'deleted' } })
  const result = await svc.deleteOrganization('org42')
  t.equal(requestStub.firstCall.args[0], '/organizations/org42', 'literal URL — no qs')
  t.equal(result.mode, 'soft', 'mode=soft')
  t.equal(result.deleted, true, 'deleted=true')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
