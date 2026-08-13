import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// tickets/opus.md "credits-exhausted UX" — the SECOND render site: the
// persisted workspace-conversation surface writes a structured
// `assistantMessage.metadata = { kind:'error', errorCode, errorMessage,
// retryable, creditsExhausted }` alongside the human-readable answer text
// (ConversationOrchestratorService.failWorkspaceLoop, server repo). Before
// this fix, `dispatch()`'s onDone handler only forwarded
// `{ text, conversationId, messageId, suggestions }` — `metadata` was
// silently dropped on EVERY live turn, so the chat UI's metadata-key check
// (`metadata.kind==='error' && metadata.errorCode===…`) had nothing to key
// off outside of a full page reload. Pins that `dispatch()` now forwards
// the assistant message's metadata verbatim.

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

test('dispatch() forwards assistantMessage.metadata verbatim on onDone (credits-exhausted signal reaches the caller)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const metadata = {
    kind: 'error',
    errorCode: 'INSUFFICIENT_CREDITS',
    errorMessage: 'Insufficient credits: needed 44, available 39',
    retryable: false,
    creditsExhausted: true
  }
  sandbox.stub(svc, '_streamWorkspaceTurn').callsFake((payload, callbacks) => {
    callbacks.onDone({
      text: 'This workspace is out of AI credits (needed 44, available 39) — retrying will not help.',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      suggestions: [],
      metadata
    })
    return () => {}
  })

  const result = await svc.dispatch({ text: 'do a thing', workspaceId: 'ws-1' })
  t.deepEqual(result.metadata, metadata, 'the raw metadata object rides the resolved result')
  t.ok(
    result.text.includes('out of AI credits') && !result.text.includes('INSUFFICIENT_CREDITS'),
    'the human text carries no raw enum'
  )
})

test('dispatch() defaults metadata to null on an ordinary (non-error) answer', async (t) => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_streamWorkspaceTurn').callsFake((payload, callbacks) => {
    callbacks.onDone({
      text: 'Here are your 3 most recent tickets.',
      conversationId: 'conv-1',
      messageId: 'msg-2',
      suggestions: []
      // no metadata key at all — mirrors a normal assistant answer
    })
    return () => {}
  })

  const result = await svc.dispatch({ text: 'list tickets', workspaceId: 'ws-1' })
  t.equal(result.metadata, null, 'metadata is explicitly null, never undefined, when the turn carries none')
})
