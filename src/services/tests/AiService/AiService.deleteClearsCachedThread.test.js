import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Deleting a thread (DELETE = soft archive of the member's link) must drop the
// per-workspace / per-project cached "last-used" conversation id when it IS
// that thread. Otherwise the next turn without an explicit thread falls back
// to the deleted id, and the server — which now answers a deleted thread with
// 404 on every read and turn path — makes that turn start with a failed
// request (the stale-404 retry then recovers it, one round trip late).
// A different cached thread is left alone.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const setup = ({ projectId = null } = {}) => {
  const svc = new AiService()
  svc._apiUrl = 'https://dev.api.symbols.app'
  svc._context = { activeProjectId: projectId }
  sandbox.stub(svc, '_activeWorkspaceId').returns('ws1')
  sandbox.stub(svc, '_requestExternal').resolves({ success: true })
  const store = {}
  sandbox.stub(svc, '_readStorage').callsFake((k) => (k in store ? store[k] : null))
  sandbox.stub(svc, '_writeStorage').callsFake((k, v) => { store[k] = v })
  sandbox.stub(svc, '_clearStorage').callsFake((k) => { delete store[k] })
  return { svc, store }
}

test('deleteConversation clears the cached workspace thread id when it is the deleted one', async (t) => {
  const { svc, store } = setup()
  const key = svc._conversationCacheKey()
  store[key] = 'conv-1'
  await svc.deleteConversation('conv-1')
  t.equal(store[key], undefined, 'the cached id is gone')
  t.equal(svc._requestExternal.callCount, 1, 'the DELETE was sent')
  sandbox.restore()
  t.end()
})

test('deleteConversation keeps a cached id of ANOTHER thread', async (t) => {
  const { svc, store } = setup()
  const key = svc._conversationCacheKey()
  store[key] = 'conv-2'
  await svc.deleteConversation('conv-1')
  t.equal(store[key], 'conv-2')
  sandbox.restore()
  t.end()
})

test('a project-scoped cached thread is cleared the same way', async (t) => {
  const { svc, store } = setup({ projectId: 'p1' })
  const key = svc._conversationCacheKey()
  t.ok(key.includes('project_p1'), 'the project cache key')
  store[key] = 'conv-9'
  await svc.deleteConversation('conv-9')
  t.equal(store[key], undefined)
  sandbox.restore()
  t.end()
})

test('the cache key is the one a turn uses (workspace + plane)', (t) => {
  const { svc } = setup()
  t.equal(svc._conversationCacheKey(), `symbols_ai_conversation_ws1_${svc._planeTag()}`)
  sandbox.restore()
  t.end()
})
