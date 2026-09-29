import test from 'tape'
import sinon from 'sinon'
import { AiService, isToolCallMessage } from '../../AiService.js'

// A TOOL-CALL assistant message is never the turn's answer.
//
// Since the server keeps what a model SAID beside its calls (callText,
// ConversationOrchestratorService — the tool-call message's content is
// [text?, { type: 'tool_call', … }, text?] with metadata.kind 'tool_call'),
// such a message can carry text. The turn handler used to end the turn on
// the first assistant `message.created` WITH text, so a live multi-step turn
// stopped at its first call ("Let me look that up."), before the real answer
// (dev regression, 2026-09-29). Every place that picks "the answer" — the
// SSE frame, the reconnect snapshot, the POST / tool-resume outcome and the
// conversation-read fallback — now skips tool-call messages.
//
// Same rig as AiService.sseReconnectRecovery.test.js: `_streamSSE` and
// `_requestExternal` are stubbed; the captured onEvent is driven directly.

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

const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const wireAcceptedTurn = (svc) => {
  let capturedOnEvent = null
  sandbox.stub(svc, '_streamSSE').callsFake((url, { onEvent }) => {
    capturedOnEvent = onEvent
    return () => {}
  })
  sandbox.stub(svc, '_requestExternal').resolves({ accepted: true })
  const onDone = sinon.spy()
  const onError = sinon.spy()
  svc._streamWorkspaceTurn(
    { projectId: 'proj-1', conversationId: 'conv-123', text: 'find my leads' },
    { onDone, onError }
  )
  return { getOnEvent: () => capturedOnEvent, onDone, onError }
}

const now = () => new Date().toISOString()

// The server's tool-call message with the words the model said before and
// after its call (callText).
const callMessage = (id = 'm-call') => ({
  id,
  role: 'assistant',
  content: [
    { type: 'text', text: 'Let me look that up.' },
    {
      type: 'tool_call',
      text: 'Calling list_records',
      payload: { name: 'list_records', args: {} }
    },
    { type: 'text', text: 'Searching the leads now.' }
  ],
  metadata: { kind: 'tool_call', tool: 'list_records', callText: true },
  createdAt: now()
})

const finalAnswer = (id = 'm-final') => ({
  id,
  role: 'assistant',
  content: [{ type: 'text', text: 'You have 3 open leads.' }],
  metadata: { suggestions: [] },
  createdAt: now()
})

test('isToolCallMessage: a tool_call part or metadata.kind tool_call marks a call, text or not', (t) => {
  t.equal(isToolCallMessage(callMessage()), true)
  t.equal(
    isToolCallMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      metadata: { kind: 'tool_call' }
    }),
    true,
    'metadata alone marks it'
  )
  t.equal(
    isToolCallMessage({
      role: 'assistant',
      content: [{ type: 'tool_call', payload: { name: 'x' } }]
    }),
    true,
    'the classic call message (no text)'
  )
  t.equal(isToolCallMessage(finalAnswer()), false)
  t.equal(isToolCallMessage(null), false)
  t.end()
})

test('SSE: a tool-call message WITH text does not end the turn; the later final answer does', async (t) => {
  const svc = makeService()
  const { getOnEvent, onDone, onError } = wireAcceptedTurn(svc)
  await tick()
  const onEvent = getOnEvent()
  t.equal(typeof onEvent, 'function', 'stream wired')

  onEvent({ event: 'message.created', data: callMessage() })
  t.equal(
    onDone.called,
    false,
    'the call message (with callText) is not the answer'
  )

  onEvent({ event: 'message.created', data: callMessage('m-call-2') })
  t.equal(onDone.called, false, 'nor is a second call')

  onEvent({ event: 'message.created', data: finalAnswer() })
  t.ok(onDone.calledOnce, 'the final answer ends the turn')
  t.equal(onDone.firstCall.args[0].text, 'You have 3 open leads.')
  t.equal(onDone.firstCall.args[0].messageId, 'm-final')
  t.equal(onError.called, false)
  t.end()
})

test('reconnect snapshot: a call message with text is skipped; the final answer after it is taken', async (t) => {
  const svc = makeService()
  const { getOnEvent, onDone } = wireAcceptedTurn(svc)
  await tick()
  const onEvent = getOnEvent()
  const user = {
    id: 'm-user',
    role: 'user',
    content: [{ type: 'text', text: 'find my leads' }],
    createdAt: now()
  }

  onEvent({
    event: 'conversation.snapshot',
    data: { messages: [user, callMessage()] }
  })
  t.equal(
    onDone.called,
    false,
    'mid-turn snapshot: only a call so far — keep waiting'
  )

  onEvent({
    event: 'conversation.snapshot',
    data: { messages: [user, callMessage(), finalAnswer()] }
  })
  t.ok(onDone.calledOnce)
  t.equal(onDone.firstCall.args[0].text, 'You have 3 open leads.')
  t.end()
})

test('POST outcome: an assistantMessage that is a tool-call message does not end the turn', async (t) => {
  const svc = makeService()
  let capturedOnEvent = null
  sandbox.stub(svc, '_streamSSE').callsFake((url, { onEvent }) => {
    capturedOnEvent = onEvent
    return () => {}
  })
  sandbox
    .stub(svc, '_requestExternal')
    .resolves({ assistantMessage: callMessage() })
  const onDone = sinon.spy()
  svc._streamWorkspaceTurn(
    { projectId: 'proj-1', conversationId: 'conv-123', text: 'find my leads' },
    { onDone, onError: () => {} }
  )
  await tick()
  t.equal(
    onDone.called,
    false,
    'a call message in the POST outcome is not the answer'
  )
  capturedOnEvent({ event: 'message.created', data: finalAnswer() })
  t.ok(onDone.calledOnce, 'the stream still delivers the real answer')
  t.equal(onDone.firstCall.args[0].text, 'You have 3 open leads.')
  t.end()
})
