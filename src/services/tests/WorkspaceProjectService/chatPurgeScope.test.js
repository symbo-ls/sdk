import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// The danger-zone chat purge and its dry run carry the page's workspace, like
// every other chat call. Without `?workspaceId=` the worker purged the
// caller's STORED active workspace (the last one used in any tab), so a
// danger page that named workspace A purged workspace B. The worker now
// purges the named workspace only for a proven member (403
// workspace_not_member otherwise) and answers a dry run on GET
// /chat/messages/purge/preview so the confirm can name the count.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

// ── purgeMessages ─────────────────────────────────────────────────────────

test('chat.purgeMessages defaults workspaceId from _context.activeWorkspaceId', async t => {
  t.plan(3)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves({ purged: 0, channels: 0 })
  await svc.chat.purgeMessages()
  t.equal(wsStub.firstCall.args[0], 'chat.purgeMessages', 'method name kept')
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge?workspaceId=ws-ctx', 'workspaceId appended from context')
  t.equal(wsStub.firstCall.args[2].method, 'POST', 'still a POST')
  sandbox.restore()
})

test('chat.purgeMessages — explicit workspaceId wins over context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves({})
  await svc.chat.purgeMessages('ws-page')
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge?workspaceId=ws-page', 'explicit arg overrides context default')
  sandbox.restore()
})

test('chat.purgeMessages — no workspaceId anywhere → bare endpoint (back-compat)', async t => {
  t.plan(2)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves({})
  await svc.chat.purgeMessages()
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge', 'byte-identical to the old call')
  t.equal(wsStub.firstCall.args[2].body, undefined, 'no body — the workspace is a routing param')
  sandbox.restore()
})

// ── previewPurgeMessages (the dry run) ────────────────────────────────────

test('chat.previewPurgeMessages GETs the dry run with the context workspace', async t => {
  t.plan(3)
  const svc = makeService('ws-ctx')
  const answer = { messages: 12, channels: 3, workspaceId: 'ws-ctx' }
  const wsStub = sandbox.stub(svc, '_ws').resolves(answer)
  const res = await svc.chat.previewPurgeMessages()
  t.equal(wsStub.firstCall.args[0], 'chat.previewPurgeMessages')
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge/preview?workspaceId=ws-ctx')
  t.deepEqual(res, answer, 'the worker answer passes through')
  sandbox.restore()
})

test('chat.previewPurgeMessages is a read: no method override, never the purge route', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves({})
  await svc.chat.previewPurgeMessages('ws-page')
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge/preview?workspaceId=ws-page', 'explicit arg wins')
  t.notOk(wsStub.firstCall.args[2] && wsStub.firstCall.args[2].method, 'GET (the _ws default), never POST')
  sandbox.restore()
})

test('chat.previewPurgeMessages — no workspaceId anywhere → bare endpoint', async t => {
  t.plan(1)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves({})
  await svc.chat.previewPurgeMessages()
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge/preview')
  sandbox.restore()
})

test('purge and preview encode the workspaceId', async t => {
  t.plan(2)
  const svc = makeService('ws/a b')
  const wsStub = sandbox.stub(svc, '_ws').resolves({})
  await svc.chat.previewPurgeMessages()
  await svc.chat.purgeMessages()
  t.equal(wsStub.firstCall.args[1], '/chat/messages/purge/preview?workspaceId=ws%2Fa%20b')
  t.equal(wsStub.secondCall.args[1], '/chat/messages/purge?workspaceId=ws%2Fa%20b')
  sandbox.restore()
})

// ── sdk.execute('workspaceProject.chat.messages', 'purge' | 'purgePreview') ─

const spy = (calls, method) => (...args) => {
  calls.push({ method, args })
  return Promise.resolve({ ok: true })
}
const makeSdk = (calls) => {
  const workspaceProject = {
    chat: {
      purgeMessages: spy(calls, 'chat.purgeMessages'),
      previewPurgeMessages: spy(calls, 'chat.previewPurgeMessages')
    }
  }
  return { getService: (name) => (name === 'workspaceProject' ? workspaceProject : {}) }
}

test("execute('workspaceProject.chat.messages', 'purgePreview') routes to the dry run with the workspaceId", async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.messages', 'purgePreview', { workspaceId: 'ws1' })
  t.deepEqual(calls[0], { method: 'chat.previewPurgeMessages', args: ['ws1'] })
})

test("execute('workspaceProject.chat.messages', 'purge') threads workspaceId; {} keeps the default", async t => {
  t.plan(2)
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.messages', 'purge', { workspaceId: 'ws1' })
  // The danger page's current call shape: execute(..., 'purge', {}).
  await execute('workspaceProject.chat.messages', 'purge', {})
  t.deepEqual(calls[0], { method: 'chat.purgeMessages', args: ['ws1'] })
  t.deepEqual(calls[1], { method: 'chat.purgeMessages', args: [undefined] }, 'the service then defaults to activeWorkspaceId')
})
