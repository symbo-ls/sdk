import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// The signed-in user's OWN sessions (CRUD sweep item 6, 2026-11-01). Server:
//   GET    /core/auth/sessions                the caller's live sessions
//   DELETE /core/auth/sessions/:sid           sign out one (409 for the
//                                             caller's own: that is logout)
//   POST   /core/auth/sessions/revoke-others  sign out all the others
// A signed-in web session only; the current session is the `sid` of the
// caller's token, so no call names it. Another user's, an unknown or an
// expired sid all answer 404.
// Names: listMySessions / revokeMySession / revokeMyOtherSessions —
// `analyzed.listSessions` (visitor analytics) already owns "listSessions".

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test.onFinish(() => sandbox.restore())

test('listMySessions GETs /auth/sessions and returns the rows', async t => {
  const svc = makeService()
  const rows = [{ sid: 's1', current: true }, { sid: 's2', current: false }]
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: rows })
  const out = await svc.listMySessions()
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/auth/sessions', 'path')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(opts.methodName, 'listMySessions', 'methodName')
  t.deepEqual(out, rows, 'the rows come back')
  sandbox.restore()
  t.end()
})

test('revokeMySession DELETEs /auth/sessions/:sid', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { revoked: 1 } })
  const out = await svc.revokeMySession('s/2')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/auth/sessions/s%2F2', 'sid encoded')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.methodName, 'revokeMySession', 'methodName')
  t.equal(opts.body, undefined, 'no body')
  t.deepEqual(out, { revoked: 1 }, 'the count comes back')
  sandbox.restore()
  t.end()
})

test('revokeMyOtherSessions POSTs /auth/sessions/revoke-others with no body', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { revoked: 3 } })
  const out = await svc.revokeMyOtherSessions()
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/auth/sessions/revoke-others', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.methodName, 'revokeMyOtherSessions', 'methodName')
  t.equal(opts.body, undefined, 'no body: the server keeps the token session')
  t.deepEqual(out, { revoked: 3 }, 'the count comes back')
  sandbox.restore()
  t.end()
})

test('revokeMySession needs a sid and passes a 409 (own session) through unchanged', async t => {
  const svc = makeService()
  const refusal = new Error('use logout for the current session', { cause: { code: 'current_session' } })
  refusal.status = 409
  const stub = sandbox.stub(svc, '_request').rejects(refusal)
  try {
    await svc.revokeMySession('')
    t.fail('no sid should throw')
  } catch (err) {
    t.match(String(err.message), /sid/, 'names the missing sid')
  }
  t.equal(stub.callCount, 0, 'nothing is sent without a sid')
  try {
    await svc.revokeMySession('s1')
    t.fail('the 409 should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
  }
  sandbox.restore()
  t.end()
})

test('SERVICE_METHODS exposes the three session methods at the top level (auth)', t => {
  t.equal(SERVICE_METHODS.listMySessions, 'auth', 'sdk.listMySessions')
  t.equal(SERVICE_METHODS.revokeMySession, 'auth', 'sdk.revokeMySession')
  t.equal(SERVICE_METHODS.revokeMyOtherSessions, 'auth', 'sdk.revokeMyOtherSessions')
  t.end()
})
