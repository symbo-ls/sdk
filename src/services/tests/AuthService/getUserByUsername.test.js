import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// WS-SDK-AUTH-USER-LOOKUP-METHOD-1 — the username twin of getUserByEmail.
// Pins: URL + query ENCODING (the email sibling never encoded and that
// stays its own bug), GET + methodName shape, envelope unwrap to the user
// object, error surfacing, and the required-arg guard.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('getUserByUsername — encoded URL, GET shape, unwraps to the user object', async t => {
  t.plan(3)
  const svc = makeService()
  const user = { id: 'u1', name: 'Nika', username: 'nika lo/za', avatar: 'a.png' }
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { user } })

  const out = await svc.getUserByUsername('nika lo/za')

  t.equal(
    requestStub.firstCall.args[0],
    '/auth/user?username=nika%20lo%2Fza',
    'username is encodeURIComponent-ed into the query'
  )
  t.deepEqual(
    { method: requestStub.firstCall.args[1].method, methodName: requestStub.firstCall.args[1].methodName },
    { method: 'GET', methodName: 'getUserByUsername' },
    'GET with its own methodName'
  )
  t.equal(out, user, 'resolves to the user object out of the envelope')

  sandbox.restore()
  t.end()
})

test('getUserByUsername — a failed envelope surfaces the server message', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'User not found' })

  try {
    await svc.getUserByUsername('ghost')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/User not found/.test(err.message), 'server message reaches the caller')
  }

  sandbox.restore()
  t.end()
})

test('getUserByUsername — missing username rejects before any request', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  try {
    await svc.getUserByUsername('')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/Username is required/.test(err.message), 'guard message')
  }
  t.equal(requestStub.callCount, 0, 'no network call without a username')

  sandbox.restore()
  t.end()
})
