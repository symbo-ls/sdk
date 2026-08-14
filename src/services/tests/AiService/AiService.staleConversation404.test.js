import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Regression for tickets/sonnet.md "a stale cached conversation id
// permanently bricks the workspace AI" (found 2026-08-15 by opus2 during
// the SSE-first live browser pass).
//
// `_resolveConversationId` returns a cached/localStorage id (or the
// caller's explicit `payload.conversationId`) without ever validating it
// server-side. If that conversation no longer exists (deleted, or minted
// against a different API plane), both the stream GET and the message POST
// 404 instantly — and nothing ever cleared the cache key on that error, so
// every subsequent turn 404s forever, permanently. The self-healing path
// (`_resolveConversationId({ forceNew: true })`) already existed; it just
// was never wired to the 404 that should trigger it.
//
// These tests stub `_streamSSE`/`_requestExternal` exactly like the sibling
// sseReconnectRecovery.test.js file — no network, no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const makeService = (storageOverrides = {}) => {
  const svc = new AiService()
  const store = {
    'symbols_ai_conversation_ws-1': 'stale-conv-id',
    ...storageOverrides
  }
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    }
  }
  sandbox.stub(svc, '_activeWorkspaceId').returns('ws-1')
  return { svc, store }
}

const err404 = () => {
  const e = new Error('Not Found')
  e.status = 404
  return e
}

test('a 404 on the message POST clears the stale cache key and retries once with a fresh conversation', async (t) => {
  t.plan(5)
  const { svc, store } = makeService()

  let streamCalls = 0
  const streamUrls = []
  sandbox.stub(svc, '_streamSSE').callsFake((url) => {
    streamCalls += 1
    streamUrls.push(url)
    return () => {}
  })

  let postCalls = 0
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.createConversation') {
      return Promise.resolve({ data: { id: 'fresh-conv-id' } })
    }
    if (opts.methodName === 'ai.appendMessage') {
      postCalls += 1
      if (postCalls === 1) return Promise.reject(err404())
      return Promise.resolve({
        assistantMessage: {
          id: 'm-1',
          content: [{ type: 'text', text: 'ok now' }]
        }
      })
    }
    return Promise.resolve({})
  })

  const onDone = sinon.spy()
  const onError = sinon.spy()
  svc._streamWorkspaceTurn({ text: 'hello' }, { onDone, onError })

  await flush()
  await flush()
  await flush()

  t.equal(
    postCalls,
    2,
    'the message POST was retried exactly once after the 404'
  )
  t.equal(
    streamCalls,
    2,
    'the SSE stream was re-subscribed against the fresh conversation'
  )
  t.ok(
    streamUrls[1] && streamUrls[1].includes('fresh-conv-id'),
    'the retry stream targets the freshly-created conversation, not the stale id'
  )
  t.equal(
    store['symbols_ai_conversation_ws-1'],
    'fresh-conv-id',
    'the cache key was overwritten with the fresh id, not left pointing at the dead one'
  )
  t.ok(
    onDone.calledOnce && onDone.firstCall.args[0].text === 'ok now',
    'the turn completes successfully after the one-shot retry'
  )
})

test('a second 404 (retry also fails) surfaces onError instead of looping forever', async (t) => {
  t.plan(2)
  const { svc } = makeService()

  sandbox.stub(svc, '_streamSSE').callsFake(() => () => {})

  let postCalls = 0
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.createConversation') {
      return Promise.resolve({ data: { id: 'fresh-conv-id' } })
    }
    if (opts.methodName === 'ai.appendMessage') {
      postCalls += 1
      return Promise.reject(err404())
    }
    return Promise.resolve({})
  })

  const onDone = sinon.spy()
  const onError = sinon.spy()
  svc._streamWorkspaceTurn({ text: 'hello' }, { onDone, onError })

  await flush()
  await flush()
  await flush()

  t.equal(
    postCalls,
    2,
    'exactly one retry was attempted — a genuinely broken backend does not loop'
  )
  t.ok(
    onError.calledOnce,
    'the second, post-retry 404 is surfaced to the caller as an error'
  )
})

test('a 404 on the SSE stream GET (not the POST) also triggers the one-shot retry', async (t) => {
  t.plan(2)
  const { svc } = makeService()

  let streamCalls = 0
  sandbox
    .stub(svc, '_streamSSE')
    .callsFake((url, { onError: onStreamError }) => {
      streamCalls += 1
      if (streamCalls === 1) {
        // Simulate the stream GET 404ing asynchronously, same as a real
        // EventSource error callback.
        setTimeout(() => onStreamError(err404()), 0)
      }
      return () => {}
    })
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.createConversation') {
      return Promise.resolve({ data: { id: 'fresh-conv-id' } })
    }
    if (opts.methodName === 'ai.appendMessage') {
      return new Promise(() => {}) // never resolves — only the stream path is under test
    }
    return Promise.resolve({})
  })

  const onError = sinon.spy()
  svc._streamWorkspaceTurn({ text: 'hello' }, { onDone: sinon.spy(), onError })

  await flush()
  await flush()
  await flush()

  t.equal(streamCalls, 2, 'the stream was re-subscribed once after its own 404')
  t.equal(
    onError.called,
    false,
    'the stream-side 404 was absorbed by the retry, not surfaced as a hard failure'
  )
})
