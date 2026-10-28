// Org admin acts on ONE member's profile (server: MemberProfileService).
//
//   updateOrgMemberProfile  PATCH /organizations/:orgId/members/:userId/profile
//   listOrgMemberDocuments  GET   /organizations/:orgId/members/:userId/documents
//
// Both are signed-in only: the bearer token rides along, and neither name may
// sit in BaseService's anonymous (no-init) set. The server owns the field list
// and every rule; the SDK checks only its own arguments and passes the
// server's refusal through with `.status` and `.cause` intact.

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

const PROFILE = {
  userId: '6ae0feba909381b3cfbe80d0',
  user_id: '6ae0feba909381b3cfbe80d0',
  name: 'Nino Beridze',
  timezone: 'Asia/Tbilisi',
  position: 'Accountant',
  city: 'Tbilisi',
  country: null,
  github: null,
  bio: null,
  updated: ['position', 'city']
}

// updateOrgMemberProfile ------------------------------------------------------

test('updateOrgMemberProfile PATCHes the member profile route and returns the unwrapped profile', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: PROFILE })
  const patch = { position: 'Accountant', city: 'Tbilisi' }
  const out = await svc.updateOrgMemberProfile('org1', '6ae0feba909381b3cfbe80d0', patch)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/members/6ae0feba909381b3cfbe80d0/profile', 'URL matches')
  t.equal(opts.method, 'PATCH', 'method PATCH')
  t.equal(opts.body, JSON.stringify(patch), 'body is the patch, as sent')
  t.equal(opts.methodName, 'updateOrgMemberProfile', 'methodName names the wrapper')
  t.deepEqual(out, PROFILE, 'returns data, not the envelope')
  sandbox.restore()
  t.end()
})

test('updateOrgMemberProfile sends null to clear a field and encodes the user id', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: PROFILE })
  await svc.updateOrgMemberProfile('org1', 'a/b', { github: null })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/members/a%2Fb/profile', 'userId is URI-encoded')
  t.equal(opts.body, '{"github":null}', 'null survives serialisation (it clears the field)')
  sandbox.restore()
  t.end()
})

test('updateOrgMemberProfile checks its own arguments and sends nothing when they are wrong', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: PROFILE })
  const cases = [
    [[undefined, 'u1', { name: 'A' }], 'orgId is required'],
    [['org1', undefined, { name: 'A' }], 'userId is required'],
    [['org1', 'u1', null], 'patch must be an object of profile fields'],
    [['org1', 'u1', ['name']], 'patch must be an object of profile fields'],
    [['org1', 'u1', {}], 'patch cannot be empty'],
    [['org1', 'u1', { name: undefined }], 'patch cannot be empty']
  ]
  for (const [args, message] of cases) {
    try {
      await svc.updateOrgMemberProfile(...args)
      t.fail(`expected a throw for ${JSON.stringify(args)}`)
    } catch (err) {
      t.equal(err.message, message, message)
    }
  }
  t.equal(requestStub.callCount, 0, 'no request on a bad argument')
  sandbox.restore()
  t.end()
})

test('updateOrgMemberProfile leaves the field list to the server: an unknown key is sent, and the 400 comes back intact', async t => {
  const svc = makeService()
  const refusal = { error: 'unknown_field', message: 'Only these profile fields can be edited here', fields: ['role'] }
  const httpErr = Object.assign(new Error(refusal.message, { cause: refusal }), { status: 400 })
  const requestStub = sandbox.stub(svc, '_request').rejects(httpErr)
  try {
    await svc.updateOrgMemberProfile('org1', 'u1', { name: 'A', role: 'owner' })
    t.fail('expected the server refusal')
  } catch (err) {
    t.equal(requestStub.callCount, 1, 'the request went out')
    t.equal(err.status, 400, 'status kept')
    t.equal(err.cause.error, 'unknown_field', 'machine code kept on err.cause.error')
    t.deepEqual(err.cause.fields, ['role'], 'the named fields kept')
  }
  sandbox.restore()
  t.end()
})

test('updateOrgMemberProfile passes a 403 rank refusal through unchanged', async t => {
  const svc = makeService()
  const refusal = { error: 'insufficient_rank', message: 'You can edit the profile of members below your role only.' }
  sandbox.stub(svc, '_request').rejects(Object.assign(new Error(refusal.message, { cause: refusal }), { status: 403 }))
  try {
    await svc.updateOrgMemberProfile('org1', 'u1', { city: 'Gori' })
    t.fail('expected the server refusal')
  } catch (err) {
    t.equal(err.status, 403, 'status kept')
    t.equal(err.cause.error, 'insufficient_rank', 'code kept')
  }
  sandbox.restore()
  t.end()
})

// listOrgMemberDocuments ------------------------------------------------------

test('listOrgMemberDocuments GETs the member documents route with no query by default', async t => {
  const svc = makeService()
  const page = { documents: [{ id: 'd1', docId: 'UDOC-1', title: 'Contract' }], count: 1, limit: 50, offset: 0 }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: page })
  const out = await svc.listOrgMemberDocuments('org1', 'u1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/members/u1/documents', 'URL matches, no query string')
  t.equal(opts.method, 'GET', 'method GET')
  t.equal(opts.body, undefined, 'a read carries no body')
  t.equal(opts.methodName, 'listOrgMemberDocuments', 'methodName names the wrapper')
  t.deepEqual(out, page, 'returns data, not the envelope')
  sandbox.restore()
  t.end()
})

test('listOrgMemberDocuments sends limit and offset when given (0 included)', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { documents: [], count: 0 } })
  await svc.listOrgMemberDocuments('org1', 'u1', { limit: 20, offset: 40 })
  await svc.listOrgMemberDocuments('org1', 'u1', { offset: 0 })
  t.equal(requestStub.firstCall.args[0], '/organizations/org1/members/u1/documents?limit=20&offset=40', 'both params')
  t.equal(requestStub.secondCall.args[0], '/organizations/org1/members/u1/documents?offset=0', 'offset 0 is sent')
  sandbox.restore()
  t.end()
})

test('listOrgMemberDocuments requires orgId and userId', async t => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  for (const [args, message] of [[[undefined, 'u1'], 'orgId is required'], [['org1'], 'userId is required']]) {
    try {
      await svc.listOrgMemberDocuments(...args)
      t.fail('expected a throw')
    } catch (err) {
      t.equal(err.message, message, message)
    }
  }
  t.equal(requestStub.callCount, 0, 'no request on a bad argument')
  sandbox.restore()
  t.end()
})

// Signed-in only + registration ----------------------------------------------

test('both wrappers are signed-in only: not in the anonymous set, and refused before init', async t => {
  const svc = new OrganizationService()
  t.equal(svc._requiresInit('updateOrgMemberProfile'), true, 'updateOrgMemberProfile carries the bearer token')
  t.equal(svc._requiresInit('listOrgMemberDocuments'), true, 'listOrgMemberDocuments carries the bearer token')
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  for (const call of [
    () => svc.updateOrgMemberProfile('org1', 'u1', { city: 'X' }),
    () => svc.listOrgMemberDocuments('org1', 'u1')
  ]) {
    try {
      await call()
      t.fail('expected a throw before init')
    } catch (err) {
      t.match(err.message, /^Service not initialized for method: (updateOrgMemberProfile|listOrgMemberDocuments)$/, err.message)
    }
  }
  t.equal(requestStub.callCount, 0, 'nothing is sent from an uninitialised service')
  sandbox.restore()
  t.end()
})

test('both wrappers are flat proxies on the organization service', t => {
  t.equal(SERVICE_METHODS.updateOrgMemberProfile, 'organization', 'sdk.updateOrgMemberProfile')
  t.equal(SERVICE_METHODS.listOrgMemberDocuments, 'organization', 'sdk.listOrgMemberDocuments')
  t.end()
})
