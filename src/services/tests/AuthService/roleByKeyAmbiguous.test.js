// The role-by-key reads and a bare key that names several owners' projects
// (server 736d2d755: the 1-seg routes answer 409 ambiguous_key + candidates).
//
//  - getMyProjectRoleByKey throws the structured ambiguous_key error (it threw
//    "Failed to get project role by key: …" with nothing to act on);
//  - getProjectRoleByKeyWithFallback answered from the user's own project list
//    with the FIRST project holding the bare key — a role for a guessed
//    project. It now matches the list on owner + key only and sends a bare key
//    to the API.

import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

const sandbox = sinon.createSandbox()

const CANDIDATES = [
  { owner: 'acme', key: 'landing' },
  { owner: 'globex', key: 'landing' }
]

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, 'hasValidTokens').returns(true)
  return svc
}

// What BaseService._request throws for a 409: status + the JSON body as cause.
const http409 = () => {
  const body = {
    error: 'ambiguous_key',
    message: 'Project key matches more than one project',
    candidates: CANDIDATES
  }
  const err = new Error(body.message, { cause: body })
  err.status = 409
  return err
}

const USER_PROJECTS = [
  { id: 'p-globex', key: 'landing', owner: { slug: 'globex' }, role: 'guest' },
  { id: 'p-acme', key: 'landing', owner: { slug: 'acme' }, role: 'owner' }
]

test('getMyProjectRoleByKey — a shared bare key throws the structured ambiguous_key error', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_request').rejects(http409())
  try {
    await svc.getMyProjectRoleByKey('landing')
    t.fail('resolved')
  } catch (err) {
    t.equal(err.code, 'ambiguous_key')
    t.equal(err.status, 409)
    t.deepEqual(err.candidates, CANDIDATES)
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getProjectRoleByKeyWithFallback — a bare key never takes the first of the user\'s projects', async (t) => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').rejects(http409())
  try {
    await svc.getProjectRoleByKeyWithFallback('landing', USER_PROJECTS)
    t.fail('resolved with a guessed role')
  } catch (err) {
    t.equal(err.code, 'ambiguous_key', 'the API answered, the list did not guess')
    t.equal(requestStub.firstCall.args[0], '/projects/key/landing/role')
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getProjectRoleByKeyWithFallback — owner + key matches the list on both', async (t) => {
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request')
  try {
    t.equal(
      await svc.getProjectRoleByKeyWithFallback({ owner: 'acme', key: 'landing' }, USER_PROJECTS),
      'owner'
    )
    t.equal(await svc.getProjectRoleByKeyWithFallback('globex/landing', USER_PROJECTS), 'guest')
    t.equal(requestStub.callCount, 0, 'no API call for a listed owner + key')
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getProjectRoleByKeyWithFallback — an unlisted owner + key asks the 2-seg role route', async (t) => {
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { role: 'editor' } })
  try {
    const role = await svc.getProjectRoleByKeyWithFallback({ owner: 'initech', key: 'landing' }, USER_PROJECTS)
    t.equal(role, 'editor')
    t.equal(requestStub.firstCall.args[0], '/projects/key/initech/landing/role')
  } finally {
    sandbox.restore()
    t.end()
  }
})
