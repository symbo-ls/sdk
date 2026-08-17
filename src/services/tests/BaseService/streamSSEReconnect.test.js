import test from 'tape'
import sinon from 'sinon'
import { BaseService } from '../../BaseService.js'

// Regression for tickets/opus2 (2026-08-14 audit): "SSE-first moved the
// fragile link from the POST to the STREAM, and the stream has NO
// reconnect — no Last-Event-ID, no backoff." Verified true against source
// before this fix: `_streamSSE` (the fetch-based GET-SSE reader the
// workspace AI turn actually uses — NOT `_sseSubscribe`, the EventSource
// helper tickets/docs/meet/chat use, which already had a 1s→8s backoff
// reconnect) had zero reconnect logic — a thrown read error OR a clean
// `done` from `reader.read()` just ended the loop silently.
//
// These tests exercise the real `_streamSSE` implementation (no stubbing of
// the method itself) against a stubbed `global.fetch`, so they fail against
// the pre-fix source and pass against the fix.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

// Builds a fake fetch Response whose body reader yields `frames` (each a
// complete `event: …\ndata: …\n\n` string, one per read() call) and then
// either ends cleanly (`done: true`, endMode='done' — simulates a dropped
// connection: an idle-timeout/proxy cut reads identically to a graceful
// close at the fetch layer) or throws a non-abort error (endMode='error').
function fakeSseResponse (frames, endMode = 'done') {
  let i = 0
  const encoder = new TextEncoder()
  return {
    ok: true,
    body: {
      getReader () {
        return {
          async read () {
            if (i < frames.length) {
              const chunk = encoder.encode(frames[i++])
              return { done: false, value: chunk }
            }
            if (endMode === 'error') {
              throw new Error('simulated connection drop')
            }
            return { done: true, value: undefined }
          },
          cancel () {
            return Promise.resolve()
          }
        }
      }
    },
    text: async () => ''
  }
}

const FRAME_A = 'event: conversation.snapshot\ndata: {"messages":[]}\n\n'
const FRAME_B = 'event: message.created\ndata: {"role":"assistant","content":[{"type":"text","text":"hi"}]}\n\n'

test('_streamSSE reconnects after the connection drops CLEANLY (reader.read() done:true with no explicit close) and delivers the next connection\'s frames', async (t) => {
  t.plan(3)
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'

  const fetchStub = sandbox.stub(global, 'fetch')
  fetchStub.onCall(0).resolves(fakeSseResponse([FRAME_A], 'done'))
  fetchStub.onCall(1).resolves(fakeSseResponse([FRAME_B], 'done'))

  const events = []
  const cancel = svc._streamSSE('https://api.test/core/agents/x/conversations/1/stream', {
    onEvent: (evt) => events.push(evt),
    onError: () => {}
  })

  // Let the first connection's frame land and the loop hit `done`.
  await new Promise((resolve) => setTimeout(resolve, 30))
  t.equal(events.length, 1, 'first connection delivered its one frame before the clean drop')

  // Past the first backoff tick (1s) — the reconnect should have fired.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  t.equal(events.length, 2, 'reconnect opened a NEW connection and delivered ITS frame too — the mechanism the audit found missing')
  t.equal(fetchStub.callCount, 2, 'fetch called once per connection attempt')

  cancel()
  sandbox.restore()
})

test('_streamSSE reconnects after a thrown (non-abort) read error, same as a clean done', async (t) => {
  t.plan(2)
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'

  const fetchStub = sandbox.stub(global, 'fetch')
  fetchStub.onCall(0).resolves(fakeSseResponse([FRAME_A], 'error'))
  fetchStub.onCall(1).resolves(fakeSseResponse([FRAME_B], 'done'))

  const events = []
  const errors = []
  const cancel = svc._streamSSE('https://api.test/core/agents/x/conversations/1/stream', {
    onEvent: (evt) => events.push(evt),
    onError: (err) => errors.push(err)
  })

  await new Promise((resolve) => setTimeout(resolve, 1150))
  t.equal(errors.length, 0, 'a dropped-connection read error is NOT surfaced as a terminal onError — it self-heals via reconnect')
  t.equal(events.length, 2, 'both connections\' frames arrived')

  cancel()
  sandbox.restore()
})

test('cancel() stops the reconnect loop — no further fetch calls after cancellation', async (t) => {
  t.plan(1)
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'

  const fetchStub = sandbox.stub(global, 'fetch')
  fetchStub.onCall(0).resolves(fakeSseResponse([], 'done'))
  fetchStub.resolves(fakeSseResponse([], 'done'))

  const cancel = svc._streamSSE('https://api.test/core/agents/x/conversations/1/stream', {
    onEvent: () => {},
    onError: () => {}
  })

  await new Promise((resolve) => setTimeout(resolve, 30))
  cancel()
  const countAtCancel = fetchStub.callCount

  // Past where a pending reconnect timer would have fired if cancel() had
  // not cleared it.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  t.equal(fetchStub.callCount, countAtCancel, 'no reconnect fired after cancel()')
  sandbox.restore()
})

test('an explicit HTTP error response (not a dropped connection) is surfaced once via onError and is NOT retried', async (t) => {
  t.plan(3)
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'

  const fetchStub = sandbox.stub(global, 'fetch')
  fetchStub.resolves({ ok: false, status: 404, body: null, text: async () => 'conversation not found' })

  const errors = []
  const cancel = svc._streamSSE('https://api.test/core/agents/x/conversations/missing/stream', {
    onEvent: () => {},
    onError: (err) => errors.push(err)
  })

  await new Promise((resolve) => setTimeout(resolve, 1150))
  t.equal(errors.length, 1, 'the HTTP rejection is surfaced exactly once')
  t.equal(errors[0].status, 404, 'status carried through')
  t.equal(fetchStub.callCount, 1, 'a real HTTP error is never retried — reconnecting would not fix a bad conversation id')

  cancel()
  sandbox.restore()
})
