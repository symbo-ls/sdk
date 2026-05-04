import test from 'tape'
import sinon from 'sinon'
import { AdminService } from '../../AdminService.js'

const sandbox = sinon.createSandbox()

test('getRateLimitStats hits /users/admin/rate-limit-stats with GET', async t => {
  t.plan(3)
  const svc = new AdminService()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { counters: {} } })
  const res = await svc.getRateLimitStats()
  t.deepEqual(res, { counters: {} })
  t.equal(stub.firstCall.args[0], '/users/admin/rate-limit-stats')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('getRateLimitStats surfaces server error message', async t => {
  t.plan(1)
  const svc = new AdminService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'nope' })
  try {
    await svc.getRateLimitStats()
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/nope/.test(err.message), 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
