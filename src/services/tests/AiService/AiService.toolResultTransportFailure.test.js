import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Regression for SDK-TOOLRESULT-REJECTED-POST-FALSE-FAILURE-1.
//
// `runClientTool` used to chain `.then(submitToolResult).catch(submitToolResult
// ok:false)` as ONE promise chain, so a REJECTED tool-result POST (409
// workspace_turn_in_progress, 5xx, timeout) — not just a genuinely failed
// tool — fell into the `.catch` and posted a SECOND result claiming the tool
// FAILED, even though the tool itself had already succeeded (the write
// landed before the POST was rejected). If that second POST won the turn
// lock, the model read a false failure and re-issued the write — a
// duplicate write. `submitToolResult`'s own retry loop also covered only
// network-class errors, so a 409 (measured live: 14-17ms hold, then 200 on
// release) was never retried at all.
//
// These tests stub `_streamSSE` (never fires) and `_requestExternal` exactly
// like the sibling staleConversation404.test.js file — no network, no real
// timers (the retry backoff is driven via sinon fake timers). The POST
// /messages response resolves already-suspended on a client tool (the
// reliable path per runClientTool's own comment), so `runClientTool` runs
// without needing to drive an SSE frame.

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

const httpError = (status, message) => {
  const e = new Error(message || `HTTP ${status}`)
  e.status = status
  return e
}

// Pure-microtask drain — safe regardless of whether fake timers are
// installed (Promise scheduling is never faked by sinon's clock).
const flushMicrotasks = async (n = 12) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

// Wires a turn whose POST /messages resolves already-suspended on client
// tool 'call-1' (skips conversation-id resolution and SSE entirely — same
// shortcut as sseReconnectRecovery.test.js's wireAcceptedTurn). `onSubmit`
// is called once per `ai.submitToolResult` attempt (0-based) and returns
// `{ reject: err }` or `{ resolve: value }` for that attempt.
const wireSuspendedTurn = (svc, { onToolCall, onSubmit }) => {
  sandbox.stub(svc, '_streamSSE').callsFake(() => () => {})
  const submitBodies = []
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.appendMessage') {
      return Promise.resolve({
        data: { suspended: true, fn: 'aiDoThing', callId: 'call-1' }
      })
    }
    if (opts.methodName === 'ai.submitToolResult') {
      const attempt = submitBodies.length
      submitBodies.push(opts.body)
      const outcome = onSubmit(attempt, opts.body)
      return outcome.reject
        ? Promise.reject(outcome.reject)
        : Promise.resolve(outcome.resolve ?? {})
    }
    return Promise.resolve({})
  })

  const onDone = sinon.spy()
  const onError = sinon.spy()
  svc._streamWorkspaceTurn(
    { projectId: 'proj-1', conversationId: 'conv-123', text: 'do it' },
    { onToolCall, onDone, onError }
  )
  return { submitBodies, onDone, onError }
}

test('tool succeeds + first submitToolResult POST 409s -> the SDK retries the SAME ok result and never posts ok:false', async (t) => {
  t.plan(4)
  const svc = makeService()
  const clock = sinon.useFakeTimers()
  try {
    const toolResult = { ok: true, data: 'wrote the card' }
    const onToolCall = sinon.stub().resolves(toolResult)
    const { submitBodies } = wireSuspendedTurn(svc, {
      onToolCall,
      onSubmit: (attempt) =>
        attempt === 0
          ? { reject: httpError(409, 'workspace_turn_in_progress') }
          : { resolve: {} }
    })

    await flushMicrotasks()
    await clock.tickAsync(1500) // the bounded 409 retry delay
    await flushMicrotasks()

    t.equal(
      submitBodies.length,
      2,
      'submitToolResult was retried exactly once after the 409'
    )
    t.equal(
      submitBodies[0].result.ok,
      true,
      'the FIRST attempt carried the true tool outcome'
    )
    t.deepEqual(
      submitBodies[1].result,
      toolResult,
      'the RETRY carried the SAME ok result, not a fabricated one'
    )
    t.equal(
      submitBodies.some((b) => b.result.ok === false),
      false,
      'no attempt ever posted a fabricated ok:false for a tool that succeeded'
    )
  } finally {
    clock.uninstall()
  }
})

test('tool succeeds + submitToolResult 5xx->success on retry -> one truthful result', async (t) => {
  t.plan(3)
  const svc = makeService()
  const clock = sinon.useFakeTimers()
  try {
    const toolResult = { ok: true, value: 42 }
    const onToolCall = sinon.stub().resolves(toolResult)
    const { submitBodies } = wireSuspendedTurn(svc, {
      onToolCall,
      onSubmit: (attempt) =>
        attempt === 0
          ? { reject: httpError(503, 'Service Unavailable') }
          : { resolve: {} }
    })

    await flushMicrotasks()
    await clock.tickAsync(1500)
    await flushMicrotasks()

    t.equal(
      submitBodies.length,
      2,
      'submitToolResult was retried once after the 5xx'
    )
    t.ok(
      submitBodies.every(
        (b) => b.result.ok === true && b.result.value === 42
      ),
      'every attempt carried the one truthful result'
    )
    t.equal(
      submitBodies.some((b) => b.result.ok === false),
      false,
      'the 5xx never turned into a fabricated tool failure'
    )
  } finally {
    clock.uninstall()
  }
})

test('tool genuinely throws -> exactly one ok:false result', async (t) => {
  t.plan(3)
  const svc = makeService()
  const onToolCall = sinon.stub().rejects(new Error('disk full'))
  const { submitBodies } = wireSuspendedTurn(svc, {
    onToolCall,
    onSubmit: () => ({ resolve: {} })
  })

  await flushMicrotasks()

  t.equal(
    submitBodies.length,
    1,
    'submitToolResult was called exactly once — a real tool failure is never retried as a transport error'
  )
  t.equal(
    submitBodies[0].result.ok,
    false,
    'the genuine throw is reported as ok:false'
  )
  t.ok(
    String(submitBodies[0].result.error).includes('disk full'),
    'the failure carries the tool error message'
  )
})

test('tool succeeds but submitToolResult exhausts every retry -> no fabricated ok:false is ever posted', async (t) => {
  t.plan(2)
  const svc = makeService()
  const clock = sinon.useFakeTimers()
  try {
    const toolResult = { ok: true, data: 'wrote the card' }
    const onToolCall = sinon.stub().resolves(toolResult)
    const { submitBodies } = wireSuspendedTurn(svc, {
      onToolCall,
      onSubmit: () => ({
        reject: httpError(409, 'workspace_turn_in_progress')
      })
    })

    await flushMicrotasks()
    await clock.tickAsync(1500)
    await flushMicrotasks()
    await clock.tickAsync(4000)
    await flushMicrotasks()

    t.equal(
      submitBodies.length,
      3,
      'exactly the bounded retry budget was spent (initial + 2 retries) — no extra fabricated call'
    )
    t.equal(
      submitBodies.some((b) => b.result.ok === false),
      false,
      'a persistent 409 never becomes a fabricated tool failure — the original bug'
    )
  } finally {
    clock.uninstall()
  }
})
