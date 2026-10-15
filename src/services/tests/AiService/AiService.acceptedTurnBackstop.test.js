import test from 'tape'
import sinon from 'sinon'
import {
  AiService,
  TURN_BACKSTOP_FIRST_MS,
  TURN_BACKSTOP_INTERVAL_MS,
  TURN_BACKSTOP_MAX_MS,
  turnOutcomeFromConversation
} from '../../AiService.js'

// A 202 `{ accepted: true }` turn must not depend on the SSE stream alone.
//
// Production runs 2 API replicas. The turn's frames (message.created,
// tool.call_required) are published on the replica that runs the loop and
// cross to the replica holding the browser's SSE GET over a Redis bridge.
// With the bridge down, the SSE connection stays open on heartbeats, never
// reconnects, and the turn sat on "Thinking" forever with 0 errors.
//
// The backstop: TURN_BACKSTOP_FIRST_MS after the ack with no turn frame, read
// the conversation, then every TURN_BACKSTOP_INTERVAL_MS until
// TURN_BACKSTOP_MAX_MS. The stored answer goes through the SAME finishAnswer
// path an SSE frame uses, exactly once; a pending client call goes through
// the SAME runClientTool path (deduped by callId).

const USER_MSG = () => ({
  id: 'u-1',
  role: 'user',
  content: [{ type: 'text', text: 'how many open tickets?' }],
  createdAt: new Date().toISOString()
})
const ANSWER = (id = 'a-1', text = 'There are 4 open tickets.') => ({
  id,
  role: 'assistant',
  content: [{ type: 'text', text }],
  metadata: { suggestions: [{ label: 'Show them' }] },
  createdAt: new Date().toISOString()
})

const makeService = () => {
  const svc = new AiService()
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
  return svc
}

// reads: array of (envelope | Error | function) served by successive GETs.
const wire = (t, { reads = [], payload = {}, callbacks = {} } = {}) => {
  const sandbox = sinon.createSandbox()
  const clock = sandbox.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date']
  })
  t.teardown(() => sandbox.restore())
  const svc = makeService()
  let onEvent = null
  sandbox.stub(svc, '_streamSSE').callsFake((url, opts) => {
    onEvent = opts.onEvent
    return () => {}
  })
  const gets = []
  sandbox.stub(svc, '_requestExternal').callsFake(async (url, opts = {}) => {
    if (opts.method === 'POST' && /\/messages$/.test(url)) {
      return {
        success: true,
        data: { accepted: true, turnId: 't-1', userMessage: USER_MSG() }
      }
    }
    if (opts.method === 'GET') {
      gets.push(url)
      const next = reads.length > 1 ? reads.shift() : reads[0]
      if (next instanceof Error) throw next
      const env = typeof next === 'function' ? next() : next
      return {
        success: true,
        data: env || { conversation: { id: 'conv-1' }, messages: [] }
      }
    }
    return { success: true, data: {} }
  })
  const submitted = []
  sandbox
    .stub(svc, 'submitToolResult')
    .callsFake(async (cid, callId, result) => {
      submitted.push({ callId, result })
      return null
    })
  const onDone = sinon.spy()
  const onError = sinon.spy()
  const onToolCall = sinon.spy(() => ({ ok: true }))
  const cancel = svc._streamWorkspaceTurn(
    {
      projectId: 'proj-1',
      conversationId: 'conv-1',
      text: 'how many open tickets?',
      ...payload
    },
    { onDone, onError, onToolCall, ...callbacks }
  )
  return {
    clock,
    svc,
    gets,
    submitted,
    onDone,
    onError,
    onToolCall,
    cancel,
    emit: (e) => onEvent(e)
  }
}

test('backstop bounds are derived and ordered', (t) => {
  t.ok(
    TURN_BACKSTOP_FIRST_MS > 0 && TURN_BACKSTOP_FIRST_MS <= 10000,
    'first read within seconds of the ack'
  )
  t.ok(
    TURN_BACKSTOP_INTERVAL_MS >= TURN_BACKSTOP_FIRST_MS,
    'periodic reads no faster than the first'
  )
  t.ok(
    TURN_BACKSTOP_MAX_MS > TURN_BACKSTOP_INTERVAL_MS * 10,
    'covers a multi-minute turn'
  )
  t.end()
})

test('accepted + NO frames: the stored answer is read and delivered through onDone once', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS - 10)
  t.equal(w.gets.length, 0, 'no read before the first bound')
  await w.clock.tickAsync(20)
  t.equal(w.gets.length, 1, 'one conversation read after the first bound')
  t.ok(/\/conversations\/conv-1$/.test(w.gets[0]), 'it reads THIS conversation')
  t.equal(w.onDone.callCount, 1, 'onDone once')
  const done = w.onDone.firstCall.args[0]
  t.equal(done.text, 'There are 4 open tickets.')
  t.equal(
    done.messageId,
    'a-1',
    'the server message id rides along (dedupe key)'
  )
  t.equal(done.conversationId, 'conv-1')
  t.deepEqual(done.suggestions, [{ label: 'Show them' }])
  t.equal(w.onError.callCount, 0)
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS * 3)
  t.equal(w.gets.length, 1, 'the backstop stops once the turn is answered')
})

test('accepted, answer not stored yet: the backstop keeps reading until it is', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG()] },
      { conversation: { id: 'conv-1' }, messages: [USER_MSG()] },
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onDone.callCount, 0, 'nothing to deliver on the first read')
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS)
  t.equal(w.onDone.callCount, 0)
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS)
  t.equal(w.gets.length, 3, 'periodic reads')
  t.equal(w.onDone.callCount, 1, 'delivered on the read that finds it')
  t.equal(w.onError.callCount, 0, 'an unanswered read is not an error')
})

test('accepted + the SSE frame arrives first: no read, no duplicate', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(10)
  w.emit({ event: 'message.created', data: ANSWER() })
  await w.clock.tickAsync(TURN_BACKSTOP_MAX_MS)
  t.equal(w.onDone.callCount, 1, 'onDone once')
  t.equal(w.gets.length, 0, 'the stream delivered: the backstop never read')
})

test('accepted + a live stream frame (delta) stops the backstop', async (t) => {
  const w = wire(t)
  await w.clock.tickAsync(10)
  w.emit({ event: 'message.delta', data: { message: 'There ' } })
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS * 5)
  t.equal(w.gets.length, 0, 'the stream proved live for this turn: no reads')
})

test('a heartbeat or snapshot frame does NOT count as the stream delivering', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(10)
  w.emit({ event: 'conversation.heartbeat', data: { subscribers: 1 } })
  w.emit({ event: 'conversation.snapshot', data: { messages: [] } })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS)
  t.equal(w.gets.length, 1, 'still read')
  t.equal(w.onDone.callCount, 1, 'and delivered')
})

test('backstop delivers first, the late SSE frame for the same message is ignored', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onDone.callCount, 1)
  w.emit({ event: 'message.created', data: ANSWER() })
  w.emit({ event: 'message.delta', data: { message: 'There are' } })
  t.equal(w.onDone.callCount, 1, 'no double render')
})

test('a read that fails is not a turn error: the next read still delivers', async (t) => {
  const err = new Error('502 Bad Gateway')
  err.status = 502
  const w = wire(t, {
    reads: [
      err,
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onError.callCount, 0, 'a failed backstop read never fails the turn')
  t.equal(w.onDone.callCount, 0)
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS)
  t.equal(w.onDone.callCount, 1, 'recovered on the next read')
  t.equal(w.onError.callCount, 0)
})

test('a 404 on the read (conversation gone) stops the backstop and leaves the stream to report it', async (t) => {
  const err = new Error('Not found')
  err.status = 404
  const w = wire(t, { reads: [err] })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS * 3)
  t.equal(w.gets.length, 1, 'no polling of a conversation that is gone')
  t.equal(w.onError.callCount, 0)
})

test("an older turn's answer before this user message is never delivered", async (t) => {
  const old = {
    ...ANSWER('a-0', 'An older answer.'),
    createdAt: new Date().toISOString()
  }
  const w = wire(t, {
    reads: [{ conversation: { id: 'conv-1' }, messages: [old, USER_MSG()] }]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onDone.callCount, 0, "the previous turn is not this turn's answer")
})

test('an intermediate tool_call assistant message is not the answer', async (t) => {
  const toolCall = {
    id: 'tc-1',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_call', name: 'x' }
    ],
    createdAt: new Date().toISOString()
  }
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), toolCall] }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onDone.callCount, 0)
})

test('a pending client call stored on the conversation runs through onToolCall once', async (t) => {
  const pending = {
    callId: 'call-9',
    tool: 'openPage',
    fn: 'openPage',
    args: ['/tickets'],
    confirm: false
  }
  const w = wire(t, {
    reads: [
      {
        conversation: {
          id: 'conv-1',
          metadata: { pendingClientCall: pending }
        },
        messages: [USER_MSG()]
      }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onToolCall.callCount, 1, 'the suspended call is run')
  t.equal(w.onToolCall.firstCall.args[0], 'call-9')
  t.equal(w.onToolCall.firstCall.args[1], 'openPage')
  t.deepEqual(w.onToolCall.firstCall.args[2], ['/tickets'])
  await w.clock.tickAsync(5)
  t.equal(w.submitted.length, 1, 'its result is submitted')
  w.emit({
    event: 'tool.call_required',
    data: { callId: 'call-9', tool: 'openPage', fn: 'openPage', args: [] }
  })
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS)
  t.equal(w.onToolCall.callCount, 1, 'deduped by callId: never run twice')
})

test('a pending call already resolved by a tool-result message is not re-run', async (t) => {
  const pending = { callId: 'call-8', tool: 'x', fn: 'x', args: [] }
  const resolved = {
    id: 'r-1',
    role: 'tool',
    metadata: { kind: 'workspace_client_action', callId: 'call-8' },
    createdAt: new Date().toISOString()
  }
  const w = wire(t, {
    reads: [
      {
        conversation: {
          id: 'conv-1',
          metadata: { pendingClientCall: pending }
        },
        messages: [USER_MSG(), resolved]
      }
    ]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.onToolCall.callCount, 0)
})

test('cancel stops the backstop', async (t) => {
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG(), ANSWER()] }
    ]
  })
  await w.clock.tickAsync(10)
  w.cancel()
  await w.clock.tickAsync(TURN_BACKSTOP_MAX_MS)
  t.equal(w.gets.length, 0)
  t.equal(w.onDone.callCount, 0)
})

test('the backstop is bounded: no reads after TURN_BACKSTOP_MAX_MS', async (t) => {
  const w = wire(t, {
    reads: [{ conversation: { id: 'conv-1' }, messages: [USER_MSG()] }]
  })
  await w.clock.tickAsync(TURN_BACKSTOP_MAX_MS + TURN_BACKSTOP_INTERVAL_MS * 2)
  const n = w.gets.length
  t.ok(
    n > 1 &&
      n <= Math.ceil(TURN_BACKSTOP_MAX_MS / TURN_BACKSTOP_INTERVAL_MS) + 1,
    `bounded read count (${n})`
  )
  await w.clock.tickAsync(TURN_BACKSTOP_MAX_MS)
  t.equal(w.gets.length, n, 'stopped')
  t.equal(w.onError.callCount, 0)
})

test('turnOutcomeFromConversation: picks the answer after the user message, else a pending call', (t) => {
  const env = {
    conversation: { id: 'c' },
    messages: [ANSWER('a-0', 'old'), USER_MSG(), ANSWER('a-2', 'new')]
  }
  t.equal(
    turnOutcomeFromConversation(env, { userMessageId: 'u-1' }).answer.id,
    'a-2'
  )
  t.equal(
    turnOutcomeFromConversation(
      { messages: [ANSWER('a-0', 'old'), USER_MSG()] },
      { userMessageId: 'u-1' }
    ).answer,
    null
  )
  t.equal(
    turnOutcomeFromConversation(null, {}).answer,
    null,
    'tolerates an empty envelope'
  )
  const p = turnOutcomeFromConversation(
    {
      conversation: {
        metadata: { pendingClientCall: { callId: 'k', fn: 'f' } }
      },
      messages: [USER_MSG()]
    },
    { userMessageId: 'u-1' }
  )
  t.equal(p.pending.callId, 'k')
  t.end()
})

test('a client tool whose resume is ACKED again: the backstop reads again and delivers', async (t) => {
  const pending = {
    callId: 'call-7',
    tool: 'openPage',
    fn: 'openPage',
    args: []
  }
  const w = wire(t, {
    reads: [
      { conversation: { id: 'conv-1' }, messages: [USER_MSG()] },
      {
        conversation: { id: 'conv-1' },
        messages: [USER_MSG(), ANSWER('a-9', 'Opened.')]
      }
    ]
  })
  w.svc.submitToolResult.restore()
  sinon.stub(w.svc, 'submitToolResult').resolves({ accepted: true })
  t.teardown(() => w.svc.submitToolResult.restore?.())
  await w.clock.tickAsync(10)
  // The suspension reaches the browser over the stream (stops the backstop)…
  w.emit({ event: 'tool.call_required', data: { ...pending } })
  await w.clock.tickAsync(5)
  t.equal(w.onToolCall.callCount, 1)
  t.equal(w.gets.length, 0, 'the stream delivered the call: no read yet')
  // …but the resumed loop's answer frame never arrives.
  await w.clock.tickAsync(TURN_BACKSTOP_FIRST_MS + 5)
  t.equal(w.gets.length, 1, 'the accepted resume restarted the backstop')
  await w.clock.tickAsync(TURN_BACKSTOP_INTERVAL_MS)
  t.equal(w.onDone.callCount, 1, 'the answer is delivered from the read')
  t.equal(w.onDone.firstCall.args[0].text, 'Opened.')
  t.equal(w.onError.callCount, 0)
})
