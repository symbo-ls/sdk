import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// CHAT-TYPING-1 — the "is typing" hint. The SDK half of the server route
// POST /chat/channels/:id/typing and the `chat.typing` SSE frame:
//   (a) chat.typing posts { state, threadParentId? } to the per-channel route;
//   (b) sdk.execute('workspaceProject.chat', 'typing', …) maps flat args to it;
//   (c) subscribeChatSse registers `chat.typing` and re-frames
//       { typing: row } → cb('chat.typing', { eventType: 'TYPING', new: row }),
//       honouring the optional channel filter like every other row event.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('chat.typing POSTs { state } to /chat/channels/:id/typing (start by default)', async (t) => {
  t.plan(4)
  const svc = makeService()
  const wsStub = sandbox.stub(svc, '_ws').resolves({ data: null })
  await svc.chat.typing('chan/1')
  const [methodName, endpoint, opts] = wsStub.firstCall.args
  t.equal(methodName, 'chat.typing', 'methodName tag')
  t.equal(endpoint, '/chat/channels/chan%2F1/typing', 'channel id is encoded')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { state: 'start' }, 'start by default, no thread key')
  sandbox.restore()
  t.end()
})

test('chat.typing carries stop and a thread parent when given', async (t) => {
  t.plan(2)
  const svc = makeService()
  const wsStub = sandbox.stub(svc, '_ws').resolves({ data: null })
  await svc.chat.typing('c1', { state: 'stop' })
  await svc.chat.typing('c1', { threadParentId: 'm-9' })
  t.deepEqual(wsStub.firstCall.args[2].body, { state: 'stop' })
  t.deepEqual(wsStub.secondCall.args[2].body, {
    state: 'start',
    threadParentId: 'm-9'
  })
  sandbox.restore()
  t.end()
})

test("sdk.execute('workspaceProject.chat', 'typing') maps flat args to chat.typing", async (t) => {
  t.plan(2)
  const calls = []
  const execute = createEntityDispatcher({
    getService: () => ({
      chat: {
        typing: (...args) => {
          calls.push(args)
          return Promise.resolve({ data: null })
        }
      }
    })
  })
  await execute('workspaceProject.chat', 'typing', {
    channelId: 'c1',
    state: 'stop',
    threadParentId: 'm-1'
  })
  await execute('workspaceProject.chat', 'typing', { channelId: 'c2' })
  t.deepEqual(calls[0], ['c1', { state: 'stop', threadParentId: 'm-1' }])
  t.deepEqual(
    calls[1],
    ['c2', { state: undefined, threadParentId: undefined }],
    'an omitted state falls to the service default (start)'
  )
  t.end()
})

test('subscribeChatSse re-frames chat.typing → cb(chat.typing, { eventType: TYPING, new: row })', (t) => {
  t.plan(4)
  const svc = new WorkspaceProjectService()
  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })
  const received = []
  svc.realtime.subscribeChatSse({ workspaceId: 'ws-1' }, (kind, payload) => {
    received.push({ kind, payload })
  })
  const desc = captured.events.find((e) => e.name === 'chat.typing')
  t.ok(desc, 'chat.typing is registered')
  const row = { channel_id: 'c1', user_email: 'a@b.com', user_id: 'u1', state: 'start' }
  captured.onEvent(desc.frame({ typing: row }, 'chat.typing'))
  t.equal(received.length, 1, 'delivered')
  t.equal(received[0].kind, 'chat.typing')
  t.deepEqual(received[0].payload, { eventType: 'TYPING', new: row, old: null })
  sandbox.restore()
  t.end()
})

test('subscribeChatSse channel filter drops another channel’s typing', (t) => {
  t.plan(2)
  const svc = new WorkspaceProjectService()
  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })
  const received = []
  svc.realtime.subscribeChatSse({ workspaceId: 'ws-1', channelIds: ['c1'] }, (kind) =>
    received.push(kind)
  )
  const desc = captured.events.find((e) => e.name === 'chat.typing')
  t.equal(desc.frame({ typing: { channel_id: 'c2', state: 'start' } }), undefined, 'c2 dropped')
  captured.onEvent(desc.frame({ typing: { channel_id: 'c1', state: 'start' } }))
  t.deepEqual(received, ['chat.typing'], 'c1 delivered')
  sandbox.restore()
  t.end()
})
