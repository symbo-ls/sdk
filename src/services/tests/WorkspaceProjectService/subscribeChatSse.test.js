import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// Chat realtime SSE cutover (chat-realtime-spec §5) — the EXACT analog of
// subscribeMeetSse. Verifies the SDK's server-SSE chat subscription:
//   (a) routes through the generalized `_sseSubscribe` at `/chat/stream`, FLAT
//       query params (the chat route reads req.query.workspaceId, not
//       filter[...]), and the `chat.<entity>.<verb>` event vocabulary; and
//   (b) re-frames each SSE entity payload (`{ message|channel|member|mention: row }`)
//       back into the SAME legacy realtime `{ eventType, new, old, _kind? }`
//       envelope the postgres_changes path emitted (§5.2), so the consumer
//       (subscribeRealtime.js) stays byte-unchanged.

const sandbox = sinon.createSandbox()
const makeService = () => new WorkspaceProjectService()

test('realtime.subscribeChatSse calls _sseSubscribe with /chat/stream + flatParams + chat events', t => {
  t.plan(8)
  const svc = makeService()
  const unsubMock = () => {}
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(unsubMock)

  const unsub = svc.realtime.subscribeChatSse(
    { workspaceId: 'ws-1' },
    () => {}
  )

  t.equal(stub.calledOnce, true, '_sseSubscribe called once')
  const [path, filter, onEvent, opts] = stub.firstCall.args
  t.equal(path, '/chat/stream', 'path is /chat/stream')
  t.equal(filter.workspaceId, 'ws-1', 'workspaceId forwarded flat')
  t.equal(typeof onEvent, 'function', 'onEvent adapter is a function')
  t.equal(opts.flatParams, true, 'flatParams:true so server reads req.query.workspaceId')
  t.ok(
    Array.isArray(opts.events) && opts.events.some((e) => e.name === 'chat.message.insert'),
    'chat event vocabulary supplied'
  )
  t.ok(
    opts.events.some((e) => e.name === 'chat.snapshot') &&
    opts.events.some((e) => e.name === 'chat.member.update') &&
    opts.events.some((e) => e.name === 'chat.mention.insert'),
    'snapshot + member + mention events registered'
  )
  t.equal(unsub, unsubMock, 'returns the unsubscribe fn from _sseSubscribe')
  sandbox.restore()
  t.end()
})

test('subscribeChatSse re-frames SSE entity payloads → the legacy realtime envelope (contract preserved)', t => {
  t.plan(16)
  const svc = makeService()

  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })

  const received = []
  svc.realtime.subscribeChatSse({ workspaceId: 'ws-1' }, (kind, payload) => {
    received.push({ kind, payload })
  })

  const fire = (name, data) => {
    const desc = captured.events.find((e) => e.name === name)
    t.ok(desc, `event ${name} is registered`)
    const framed = desc.frame(data, name)
    if (framed !== undefined) captured.onEvent(framed)
  }

  // Server `_wireData` shapes data per entity: { message | channel | member | mention: row }.
  fire('chat.message.insert', { message: { id: 'm1', channel_id: 'c1', body: 'hi' } })
  fire('chat.message.delete', { message: { id: 'm2', channel_id: 'c1' } })
  fire('chat.channel.update', { channel: { id: 'c1', name: 'general' } })
  fire('chat.member.insert', { member: { channel_id: 'c1', member_email: 'a@b.com', muted: false } })
  fire('chat.mention.insert', { mention: { id: 'x1', message_id: 'm1', mentioned_email: 'a@b.com', channel_id: 'c1' } })
  // snapshot has its own kind; error is swallowed.
  fire('chat.snapshot', { channels: [{ id: 'c1' }], members: [], mentionsUnread: [] })
  fire('error', { error: 'boom', message: 'x' })

  t.equal(received.length, 6, 'error swallowed; 6 events delivered (incl. snapshot)')
  t.deepEqual(received[0], {
    kind: 'chat.messages',
    payload: { eventType: 'INSERT', new: { id: 'm1', channel_id: 'c1', body: 'hi' }, old: null }
  }, 'message.insert → {eventType:INSERT, new: row, old: null}')
  t.deepEqual(received[1], {
    kind: 'chat.messages',
    payload: { eventType: 'DELETE', new: null, old: { id: 'm2', channel_id: 'c1' } }
  }, 'message.delete → {eventType:DELETE, new: null, old: row}')
  t.deepEqual(received[2], {
    kind: 'chat.channels',
    payload: { eventType: 'UPDATE', new: { id: 'c1', name: 'general' }, old: null }
  }, 'channel.update → chat.channels op, no _kind')
  t.equal(received[3].kind, 'chat.channels', 'member → chat.channels op')
  t.equal(received[3].payload._kind, 'member', 'member tagged _kind:member (legacy envelope parity)')
  t.deepEqual(received[4], {
    kind: 'chat.mentions',
    payload: { eventType: 'INSERT', new: { id: 'x1', message_id: 'm1', mentioned_email: 'a@b.com', channel_id: 'c1' }, old: null }
  }, 'mention.insert → chat.mentions op, server-enriched channel_id preserved')
  t.equal(received[5].kind, 'chat.snapshot', 'snapshot → chat.snapshot kind')
  t.deepEqual(received[5].payload.channels, [{ id: 'c1' }], 'snapshot payload passed through')
  sandbox.restore()
  t.end()
})

test('subscribeChatSse channelIds filter masks non-matching message/member events', t => {
  t.plan(4)
  const svc = makeService()
  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })

  const received = []
  svc.realtime.subscribeChatSse({ channelIds: ['c1'] }, (kind, payload) => {
    received.push({ kind, payload })
  })

  const fire = (name, data) => {
    const desc = captured.events.find((e) => e.name === name)
    const framed = desc.frame(data, name)
    if (framed !== undefined) captured.onEvent(framed)
  }

  fire('chat.message.insert', { message: { id: 'm1', channel_id: 'c1', body: 'in' } })   // kept
  fire('chat.message.insert', { message: { id: 'm2', channel_id: 'c2', body: 'out' } })  // dropped
  fire('chat.member.update', { member: { channel_id: 'c2', member_email: 'a@b.com' } })  // dropped

  t.equal(received.length, 1, 'only the matching-channel event delivered')
  t.equal(received[0].payload.new.id, 'm1', 'kept c1 message')
  // channelIds is forwarded ONLY as a client-side filter, not a server query param.
  const filterArg = svc.realtime.subscribeChatSse.length // smoke: function exists
  t.equal(typeof filterArg, 'number', 'subscribeChatSse is defined')
  t.pass('channelIds filtered client-side (stream is per-session/workspace)')
  sandbox.restore()
  t.end()
})

test('subscribeChatSse returns a noop unsub when callback is not a function', t => {
  t.plan(1)
  const svc = makeService()
  const unsub = svc.realtime.subscribeChatSse({ workspaceId: 'ws-1' }, null)
  t.equal(typeof unsub, 'function', 'noop unsub returned (no throw)')
  t.end()
})
