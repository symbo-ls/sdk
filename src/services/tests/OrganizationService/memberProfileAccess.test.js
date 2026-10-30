// Would the org's edit of ONE member's profile, and its read of that member's
// documents, go through? (server: MemberProfileService, "Access read").
//
//   getOrgMemberProfileAccess  GET /organizations/:orgId/members/:userId/profile-access
//
// Signed-in only: the bearer token rides along, and the name may not sit in
// BaseService's anonymous (no-init) set. The server owns every rule. A side
// that is refused is a VALUE in the 200 answer (`{ allowed: false, error }`),
// never a throw; a refusal of the whole read (404 member_not_found, the
// membership 403) comes back as the thrown Error with `.status` and `.cause`
// intact, like updateOrgMemberProfile / listOrgMemberDocuments.

import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

const ANSWER = {
  edit: { allowed: false, error: 'member_not_managed' },
  documents: { allowed: true }
}

const refusal = (status, body) =>
  Object.assign(new Error(body.message || body.error, { cause: body }), { status })

test('getOrgMemberProfileAccess GETs the profile-access route and returns the unwrapped answer', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: ANSWER })
  const out = await svc.getOrgMemberProfileAccess('org1', '6ae0feba909381b3cfbe80d0')
  t.equal(requestStub.callCount, 1, 'one request')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/members/6ae0feba909381b3cfbe80d0/profile-access', 'URL matches, no query string')
  t.equal(opts.method, 'GET', 'method GET')
  t.equal(opts.body, undefined, 'a read carries no body')
  t.equal(opts.methodName, 'getOrgMemberProfileAccess', 'methodName names the wrapper')
  t.deepEqual(out, ANSWER, 'returns data, not the envelope')
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess URI-encodes the user id (the roster legacy id included)', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: ANSWER })
  await svc.getOrgMemberProfileAccess('org1', 'a/b?c')
  await svc.getOrgMemberProfileAccess('org1', '1b4e28ba-2fa1-11d2-883f-0016d3cca427')
  t.equal(requestStub.firstCall.args[0], '/organizations/org1/members/a%2Fb%3Fc/profile-access', 'userId is URI-encoded')
  t.equal(requestStub.secondCall.args[0], '/organizations/org1/members/1b4e28ba-2fa1-11d2-883f-0016d3cca427/profile-access', 'a UUID passes as is')
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess: a refused side is a value in the answer, never a throw', async t => {
  const svc = makeService()
  const noKey = { allowed: false, error: 'insufficient_permission' }
  sandbox.stub(svc, '_request').resolves({ success: true, data: { edit: noKey, documents: noKey } })
  const out = await svc.getOrgMemberProfileAccess('org1', 'u1')
  t.deepEqual(out, { edit: noKey, documents: noKey }, 'both sides refused, still a resolved answer')
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess checks its own arguments and sends nothing when they are wrong', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: ANSWER })
  for (const [args, message] of [
    [[undefined, 'u1'], 'orgId is required'],
    [['', 'u1'], 'orgId is required'],
    [['org1'], 'userId is required'],
    [['org1', ''], 'userId is required']
  ]) {
    try {
      await svc.getOrgMemberProfileAccess(...args)
      t.fail(`expected a throw for ${JSON.stringify(args)}`)
    } catch (err) {
      t.equal(err.message, message, message)
    }
  }
  t.equal(requestStub.callCount, 0, 'no request on a bad argument')
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess passes the 404 member_not_found through with .status and .cause', async t => {
  const svc = makeService()
  const body = { error: 'member_not_found', message: 'No member with this id in this organization.' }
  sandbox.stub(svc, '_request').rejects(refusal(404, body))
  try {
    await svc.getOrgMemberProfileAccess('org1', 'u1')
    t.fail('expected the server refusal')
  } catch (err) {
    t.equal(err.status, 404, 'status kept')
    t.equal(err.cause.error, 'member_not_found', 'machine code kept on err.cause.error')
    t.equal(err.message, body.message, 'the server message is the Error message')
  }
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess passes the membership 403 through unchanged', async t => {
  const svc = makeService()
  const body = { error: 'Organization membership required' }
  sandbox.stub(svc, '_request').rejects(refusal(403, body))
  try {
    await svc.getOrgMemberProfileAccess('org1', 'u1')
    t.fail('expected the server refusal')
  } catch (err) {
    t.equal(err.status, 403, 'status kept')
    t.deepEqual(err.cause, body, 'the body kept on err.cause')
  }
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess is signed-in only: not in the anonymous set, and refused before init', async t => {
  const svc = new OrganizationService()
  t.equal(svc._requiresInit('getOrgMemberProfileAccess'), true, 'carries the bearer token')
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: ANSWER })
  try {
    await svc.getOrgMemberProfileAccess('org1', 'u1')
    t.fail('expected a throw before init')
  } catch (err) {
    t.equal(err.message, 'Service not initialized for method: getOrgMemberProfileAccess', err.message)
  }
  t.equal(requestStub.callCount, 0, 'nothing is sent from an uninitialised service')
  sandbox.restore()
  t.end()
})

test('getOrgMemberProfileAccess is a flat proxy on the organization service', t => {
  t.equal(SERVICE_METHODS.getOrgMemberProfileAccess, 'organization', 'sdk.getOrgMemberProfileAccess')
  t.end()
})
