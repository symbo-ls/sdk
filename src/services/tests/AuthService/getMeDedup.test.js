import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_resolvePluginSession').returns(null)
  return svc
}

test('getMe — 4 parallel callers within tick share ONE network request', async t => {
  t.plan(2)
  const svc = makeService()
  // Defer resolution so all 4 calls are inflight simultaneously
  let resolveRequest
  const requestStub = sandbox.stub(svc, '_request').returns(new Promise(r => { resolveRequest = r }))

  const p1 = svc.getMe()
  const p2 = svc.getMe()
  const p3 = svc.getMe()
  const p4 = svc.getMe()

  // All 4 should share the same inflight promise
  t.equal(requestStub.callCount, 1, 'only 1 network call despite 4 concurrent getMe()')

  resolveRequest({ success: true, data: { id: 'u1', email: 'a@b.c' } })
  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4])
  t.deepEqual([r1, r2, r3, r4], [r1, r1, r1, r1], 'all 4 promises resolve to same payload')

  sandbox.restore()
  t.end()
})

test('getMe — sequential calls within 50ms TTL share request', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'u2' } })

  await svc.getMe()
  // Immediately re-fire — within the 50ms TTL
  await svc.getMe()

  // 2 sequential awaits that both fall within the TTL should share the request
  // (the first await already resolved, second one starts AFTER first finishes,
  // but before the setTimeout(50ms) fires that clears the inflight slot).
  t.equal(requestStub.callCount, 1, 'second call within TTL hits cache, not network')

  sandbox.restore()
  t.end()
})

test('getMe — sequential calls AFTER TTL elapses fire fresh request', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'u3' } })

  await svc.getMe()
  // Wait past the 50ms TTL window
  await new Promise(r => setTimeout(r, 80))
  await svc.getMe()

  t.equal(requestStub.callCount, 2, 'post-TTL caller triggers fresh network request')

  sandbox.restore()
  t.end()
})

test('getMe — failed request clears inflight; next caller can retry', async t => {
  t.plan(3)
  const svc = makeService()
  let callIdx = 0
  const requestStub = sandbox.stub(svc, '_request').callsFake(() => {
    callIdx++
    if (callIdx === 1) return Promise.reject(new Error('Network error'))
    return Promise.resolve({ success: true, data: { id: 'u4' } })
  })

  try {
    await svc.getMe()
    t.fail('first call should have thrown')
  } catch (e) {
    t.ok(/Failed to get user profile/.test(e.message), 'first call surfaces wrapped error')
  }

  // Should NOT be locked into the same failed promise — retry must hit network
  const result = await svc.getMe()
  t.equal(requestStub.callCount, 2, 'retry hits network (inflight cleared on error)')
  t.equal(result.id, 'u4', 'retry returns fresh payload')

  sandbox.restore()
  t.end()
})

test('getMe — different session keys do NOT collide in inflight map', async t => {
  t.plan(1)
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  // Resolver returns the literal option for session-keyed routing
  sandbox.stub(svc, '_resolvePluginSession').callsFake(opt => opt || null)

  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await Promise.all([
    svc.getMe(),                       // default lane
    svc.getMe({ session: 'aaa' }),     // session lane A
    svc.getMe({ session: 'bbb' })      // session lane B
  ])

  t.equal(requestStub.callCount, 3, 'each distinct session key gets its own request')

  sandbox.restore()
  t.end()
})
