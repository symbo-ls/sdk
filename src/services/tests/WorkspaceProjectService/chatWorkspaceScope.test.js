import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// "workspace-scoping gaps in the chat transport" (tickets/sdk.md, 2026-07-13)
// items 2+3+4 — chat reads carry workspace scope (query param, defaulting to
// _context.activeWorkspaceId), and channel→workspace bulk escalation is only
// allowed when the caller passes { bulk: true } explicitly.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

// ── listChannels ─────────────────────────────────────────────────────────

test('chat.listChannels defaults workspaceId from _context.activeWorkspaceId', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listChannels()
  t.equal(wsStub.firstCall.args[1], '/chat/channels?workspaceId=ws-ctx', 'workspaceId appended from context')
  sandbox.restore()
})

test('chat.listChannels — explicit workspaceId wins over context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listChannels('ws-explicit')
  t.equal(wsStub.firstCall.args[1], '/chat/channels?workspaceId=ws-explicit', 'explicit arg overrides context default')
  sandbox.restore()
})

test('chat.listChannels — no workspaceId anywhere → no query string (back-compat)', async t => {
  t.plan(1)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listChannels()
  t.equal(wsStub.firstCall.args[1], '/chat/channels', 'bare endpoint, byte-identical to pre-fix behavior')
  sandbox.restore()
})

// ── listMessages — no silent channel→workspace escalation ──────────────────

test('chat.listMessages throws when channelId is falsy and bulk is not explicit', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  sandbox.stub(svc, '_ws').resolves([])
  try {
    await svc.chat.listMessages(undefined, { limit: 10 })
    t.fail('expected a throw')
  } catch (err) {
    t.match(err.message, /channelId is required/, 'explicit error, no silent bulk fallthrough')
  }
  sandbox.restore()
})

test('chat.listMessages routes to the per-channel endpoint + tags workspaceId', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMessages('chan-1', { limit: 10 })
  t.equal(
    wsStub.firstCall.args[1],
    '/chat/channels/chan-1/messages?limit=10&workspaceId=ws-ctx',
    'per-channel endpoint carries workspaceId from context'
  )
  sandbox.restore()
})

test('chat.listMessages { bulk: true } explicitly routes to the workspace-wide endpoint', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMessages(undefined, { bulk: true, limit: 500 })
  t.equal(wsStub.firstCall.args[0], 'chat.listAllMessages', 'bulk methodName tag')
  t.equal(
    wsStub.firstCall.args[1],
    '/chat/messages?limit=500&workspaceId=ws-ctx',
    'bulk endpoint carries workspaceId from context'
  )
  sandbox.restore()
})

test('chat.listMessages — explicit options.workspaceId overrides context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMessages('chan-1', { workspaceId: 'ws-explicit' })
  t.equal(
    wsStub.firstCall.args[1],
    '/chat/channels/chan-1/messages?workspaceId=ws-explicit',
    'explicit workspaceId wins over context default'
  )
  sandbox.restore()
})

// ── listMembers — no silent channel→workspace escalation ───────────────────

test('chat.listMembers throws when channelId is falsy and bulk is not explicit', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  sandbox.stub(svc, '_ws').resolves([])
  try {
    await svc.chat.listMembers()
    t.fail('expected a throw')
  } catch (err) {
    t.match(err.message, /channelId is required/, 'explicit error, no silent bulk fallthrough')
  }
  sandbox.restore()
})

test('chat.listMembers { bulk: true } explicitly routes to the workspace-wide endpoint', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMembers(undefined, { bulk: true })
  t.equal(wsStub.firstCall.args[0], 'chat.listAllMembers', 'bulk methodName tag')
  t.equal(wsStub.firstCall.args[1], '/chat/members?workspaceId=ws-ctx', 'bulk endpoint carries workspaceId from context')
  sandbox.restore()
})

test('chat.listMembers per-channel call carries workspaceId', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMembers('chan-1')
  t.equal(
    wsStub.firstCall.args[1],
    '/chat/channels/chan-1/members?workspaceId=ws-ctx',
    'per-channel endpoint carries workspaceId from context'
  )
  sandbox.restore()
})

// ── listMentions / searchMessages — workspaceId as a query param ───────────

test('chat.listMentions sends workspaceId as a query param, not folded into the POST body', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.listMentions({ column: 'x' }, { limit: 20 })
  t.equal(wsStub.firstCall.args[1], '/chat/mentions?workspaceId=ws-ctx', 'workspaceId in the URL')
  t.deepEqual(
    wsStub.firstCall.args[2].body,
    { filter: { column: 'x' }, options: { limit: 20 } },
    'workspaceId stripped out of the POST body options'
  )
  sandbox.restore()
})

test('chat.searchMessages sends workspaceId as a query param', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.chat.searchMessages('hello', 'a@b.com')
  t.equal(wsStub.firstCall.args[1], '/chat/search?workspaceId=ws-ctx', 'workspaceId in the URL')
  t.deepEqual(wsStub.firstCall.args[2].body, { q: 'hello', callerEmail: 'a@b.com' }, 'body unchanged')
  sandbox.restore()
})

// ── realtime.subscribeChatSse — workspaceId defaulting (item 4) ────────────

test('realtime.subscribeChatSse defaults workspaceId from _context.activeWorkspaceId when omitted', t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  svc.realtime.subscribeChatSse({}, () => {})
  const filter = stub.firstCall.args[1]
  t.equal(filter.workspaceId, 'ws-ctx', 'workspaceId defaulted from context')
  sandbox.restore()
})

test('realtime.subscribeChatSse — explicit workspaceId still wins over context', t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  svc.realtime.subscribeChatSse({ workspaceId: 'ws-explicit' }, () => {})
  const filter = stub.firstCall.args[1]
  t.equal(filter.workspaceId, 'ws-explicit', 'explicit arg overrides context default')
  sandbox.restore()
})
