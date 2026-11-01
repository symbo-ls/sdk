import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// CRUD sweep item 6 (2026-11-01), the organization half:
//   leaveOrganization — POST /core/organizations/:orgId/leave. The caller
//     leaves the org (self only: the user is the token's, never a body id).
//     Refusals: 409 `last_owner_cannot_leave` (transfer ownership first),
//     400 `personal_org_unleavable`, 404 `organization_not_found`. Item 16's
//     Leave button (MemberProfile) calls this.
//   detachOrgCustomDomain — DELETE /core/organizations/:orgId/custom-domains/
//     :domain (org managers): the sibling of attach / verify; answers the
//     remaining { customDomains }.
// Paths stay literal at the call site (the drift analyzer reads only those).

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test.onFinish(() => sandbox.restore())

test('leaveOrganization POSTs /organizations/:orgId/leave with no body', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { left: true } })
  const out = await svc.leaveOrganization('org1')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/organizations/org1/leave', 'literal path')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.methodName, 'leaveOrganization', 'methodName')
  t.equal(opts.body, undefined, 'no body: the server leaves the caller only')
  t.deepEqual(out, { left: true }, 'the envelope data comes back')
  sandbox.restore()
  t.end()
})

test('leaveOrganization passes the 409 last_owner_cannot_leave refusal through unchanged', async t => {
  const svc = makeService()
  const body = { success: false, error: 'last_owner_cannot_leave', code: 'last_owner_cannot_leave', message: 'Transfer ownership first.' }
  const refusal = new Error(body.message, { cause: body })
  refusal.status = 409
  sandbox.stub(svc, '_request').rejects(refusal)
  try {
    await svc.leaveOrganization('org1')
    t.fail('leave should reject')
  } catch (err) {
    t.equal(err.status, 409, 'the HTTP status is on the error')
    t.equal(err.cause && err.cause.code, 'last_owner_cannot_leave', 'the refusal code is on err.cause')
  }
  sandbox.restore()
  t.end()
})

test('detachOrgCustomDomain DELETEs /organizations/:orgId/custom-domains/:domain', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { customDomains: [] } })
  const out = await svc.detachOrgCustomDomain('org1', 'app.acme.ge')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/organizations/org1/custom-domains/app.acme.ge', 'literal path')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.methodName, 'detachOrgCustomDomain', 'methodName')
  t.equal(opts.body, undefined, 'no body')
  t.deepEqual(out, { customDomains: [] }, 'the remaining domains come back')
  sandbox.restore()
  t.end()
})

test('leaveOrganization and detachOrgCustomDomain need their arguments', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  const cases = [
    [() => svc.leaveOrganization(''), /orgId/],
    [() => svc.detachOrgCustomDomain('', 'app.acme.ge'), /orgId/],
    [() => svc.detachOrgCustomDomain('org1', ''), /domain/]
  ]
  for (const [run, re] of cases) {
    try {
      await run()
      t.fail('a missing argument should throw')
    } catch (err) {
      t.match(String(err.message), re, 'names the missing argument')
    }
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('organizations', 'leave', …) reaches leaveOrganization", async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'organization' ? svc : null) })
  await execute('organizations', 'leave', { orgId: 'org1' })
  await execute('organizations', 'leave', { id: 'org2' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1].method]), [
    ['/organizations/org1/leave', 'POST'],
    ['/organizations/org2/leave', 'POST']
  ])
  sandbox.restore()
  t.end()
})

test('SERVICE_METHODS exposes leaveOrganization and detachOrgCustomDomain (organization)', t => {
  t.equal(SERVICE_METHODS.leaveOrganization, 'organization', 'sdk.leaveOrganization')
  t.equal(SERVICE_METHODS.detachOrgCustomDomain, 'organization', 'sdk.detachOrgCustomDomain')
  t.end()
})
