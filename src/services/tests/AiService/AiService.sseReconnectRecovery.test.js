import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Regression for tickets/opus2 (2026-08-14 audit): "SSE-first moved the
// fragile link from the POST to the STREAM, and the stream has no
// reconnect... so a slow turn whose stream dies loses the answer
// client-side even though the server persisted it."
//
// `_streamSSE` (BaseService.js) now reconnects with backoff on a dropped
// connection (see its own regression coverage in
// src/services/tests/BaseService/streamSSEReconnect.test.js). This file
// covers the OTHER half of the fix: this endpoint sets no per-event `id:`
// field, so Last-Event-ID resume is impossible — a reconnect's ONLY resync
// signal is the fresh `conversation.snapshot` frame the server sends on
// every connect (AgentConversationController / AgentWorkspaceConversation-
// Controller, server repo). Before this fix, `_streamWorkspaceTurn`'s
// onEvent handler had no case for `conversation.snapshot` at all, so even a
// working reconnect would silently re-sync and then ignore an answer that
// was sitting right there in the snapshot — the turn would hang forever
// with no onDone/onError, exactly the loss the audit described.
//
// These tests stub `_streamSSE` to capture the onEvent callback and drive it
// directly, exactly like the existing subscribeMeetSse.test.js pattern for
// _sseSubscribe — no network, no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = () => {
  const svc = new AiService()
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
  return svc
}

// Wires a turn whose POST resolves with the SSE-first `{ accepted: true }`
// ack (no assistantMessage, no suspension) — the exact shape that used to
// skip the fallback entirely (see _streamWorkspaceTurn's `if (outcome &&
// outcome.accepted) return`). Returns the captured onEvent so the test can
// drive the stream directly, plus the onDone/onError spies.
const wireAcceptedTurn = (svc, payload = {}) => {
  let capturedOnEvent = null
  sandbox.stub(svc, '_streamSSE').callsFake((url, { onEvent }) => {
    capturedOnEvent = onEvent
    return () => {}
  })
  sandbox.stub(svc, '_requestExternal').resolves({ accepted: true })

  const onDone = sinon.spy()
  const onError = sinon.spy()
  svc._streamWorkspaceTurn(
    { projectId: 'proj-1', conversationId: 'conv-123', text: 'do the thing', ...payload },
    { onDone, onError }
  )
  return { getOnEvent: () => capturedOnEvent, onDone, onError }
}

test('a reconnect conversation.snapshot carrying THIS turn\'s persisted answer finishes the turn (the loss the audit reported)', async (t) => {
  t.plan(3)
  const svc = makeService()
  const { getOnEvent, onDone, onError } = wireAcceptedTurn(svc)

  // Give the async IIFE inside _streamWorkspaceTurn a tick to resolve the
  // conversationId + wire the stream + POST before we drive events.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  const onEvent = getOnEvent()
  t.equal(typeof onEvent, 'function', '_streamSSE onEvent adapter was captured')

  // Simulate: original connection dropped mid-turn, the loop finished
  // server-side and persisted the answer, _streamSSE reconnected and the
  // NEW connection's conversation.snapshot frame carries it.
  onEvent({
    event: 'conversation.snapshot',
    data: {
      conversation: { id: 'conv-123' },
      messages: [
        {
          id: 'm-1',
          role: 'user',
          content: [{ type: 'text', text: 'do the thing' }],
          createdAt: new Date().toISOString()
        },
        {
          id: 'm-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'done — here is the answer' }],
          metadata: { suggestions: [{ label: 'Undo' }] },
          createdAt: new Date().toISOString()
        }
      ]
    }
  })

  t.equal(onError.called, false, 'no error surfaced')
  t.ok(
    onDone.calledOnce && onDone.firstCall.args[0].text === 'done — here is the answer',
    'the persisted answer recovered from the reconnect snapshot reaches onDone — the turn no longer hangs forever'
  )
})

test('a conversation.snapshot with only STALE (pre-turn) assistant messages does NOT finish the turn', async (t) => {
  t.plan(2)
  const svc = makeService()
  const { getOnEvent, onDone, onError } = wireAcceptedTurn(svc)

  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  const onEvent = getOnEvent()

  // A snapshot whose only assistant message predates this turn by a wide
  // margin (a PREVIOUS turn's answer) must never be mistaken for this
  // turn's reply — mirrors the sinceTs bound _fallbackToLatestAssistant
  // already enforces for the POST-race fallback path.
  onEvent({
    event: 'conversation.snapshot',
    data: {
      messages: [
        {
          id: 'old-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'an older, unrelated answer' }],
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      ]
    }
  })

  t.equal(onDone.called, false, 'the stale answer is not surfaced as this turn\'s reply')
  t.equal(onError.called, false, 'no error either — the turn is still legitimately in flight')
})

test('conversation.snapshot with no assistant message at all is a no-op (initial connect before the turn produced anything)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const { getOnEvent, onDone, onError } = wireAcceptedTurn(svc)

  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  const onEvent = getOnEvent()
  onEvent({ event: 'conversation.snapshot', data: { messages: [] } })

  t.equal(onDone.called, false, 'no premature finish on an empty snapshot')
  t.equal(onError.called, false, 'no error either')
})
