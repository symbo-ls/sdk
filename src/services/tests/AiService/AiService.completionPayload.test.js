import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// `sdk.ai.completion({ messages, systemPromptOverride })` — the documented
// stateless payload three surfaces already send (the shell's generated
// assistant starters, and the ticket modal's two field-synthesis calls).
//
// CORE-SDK-AI-COMPLETION-DROPS-MESSAGES-AND-SYSTEM-OVERRIDE-1: completion()
// wrapped stream(), which posts into the member's PERSISTENT workspace
// conversation and composes its body from `content` alone. Both documented
// fields were read nowhere on that path, so every such caller posted an EMPTY
// user turn with no system instruction — an HTTP_400 on a fresh thread, a
// freewheeling answer on a thread with history, and an error row left in the
// member's own visible thread either way.
//
// Four properties are pinned here:
//   1. the user content REACHES THE WIRE (the repro: it was '' before);
//   2. the system instruction rides with it (`systemPromptOverride` → the
//      route's `system`);
//   3. the turn is EPHEMERAL — it never appends to the member's conversation;
//   4. the return keeps `{ text }` first, which is what all three consumers'
//      shape ladders read.
//
// Same rig as the sibling attachments test: `_streamSSE` and
// `_requestExternal` are stubbed, so there is no network and no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = () => {
  const svc = new AiService()
  sandbox.stub(svc, '_activeWorkspaceId').returns('ws-1')
  const cacheKey = `symbols_ai_conversation_ws-1_${svc._planeTag()}`
  const store = { [cacheKey]: 'conv-1' }
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    }
  }
  sandbox.stub(svc, '_streamSSE').callsFake(() => () => {})
  const calls = []
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    calls.push({ url, methodName: opts.methodName, body: opts.body })
    if (opts.methodName === 'ai.turn') {
      return Promise.resolve({
        success: true,
        data: { text: 'ASSISTANT TEXT', type: 'final_text', usage: { inputTokens: 7, outputTokens: 3 } }
      })
    }
    if (opts.methodName === 'ai.appendMessage') {
      return Promise.resolve({
        assistantMessage: { _id: 'm2', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
      })
    }
    return Promise.resolve({ data: { id: 'conv-1' } })
  })
  return { svc, calls }
}

const SYSTEM = 'Return ONLY a JSON array of starter objects.'
const USER = 'Workspace snapshot (JSON):{"apps":[]}'

test('completion() puts the caller messages[] on the wire', async (t) => {
  t.plan(3)
  const { svc, calls } = makeService()

  await svc.completion({
    messages: [{ role: 'user', content: USER }],
    systemPromptOverride: SYSTEM
  })

  t.equal(calls.length, 1, 'exactly one request')
  t.deepEqual(
    calls[0].body.messages,
    [{ role: 'user', content: USER }],
    'the caller turn reaches the server verbatim — never an empty content string'
  )
  t.equal(calls[0].body.content, undefined, 'messages[] replaces content, it never rides beside it')
})

test('completion() forwards systemPromptOverride as the per-turn system instruction', async (t) => {
  t.plan(2)
  const { svc, calls } = makeService()

  await svc.completion({
    messages: [{ role: 'user', content: USER }],
    systemPromptOverride: SYSTEM
  })

  t.equal(calls[0].body.system, SYSTEM, 'systemPromptOverride lands as `system`')
  t.equal(calls[0].body.modelMode, 'auto', "the user's provider mode still routes the turn")
})

test('completion() runs EPHEMERAL — it never appends to the persistent thread', async (t) => {
  t.plan(3)
  const { svc, calls } = makeService()

  await svc.completion({ messages: [{ role: 'user', content: USER }], systemPromptOverride: SYSTEM })

  t.equal(
    calls.filter((c) => c.methodName === 'ai.appendMessage').length,
    0,
    'no message is posted into the member conversation'
  )
  t.equal(calls[0].methodName, 'ai.turn', 'the ephemeral /turn route carries it')
  t.ok(
    /\/core\/agents\/workspaces\/ws-1\/turn$/.test(calls[0].url),
    'posted to the workspace turn route, not a conversation'
  )
})

test('completion() answers { text } first — the shape every consumer reads', async (t) => {
  t.plan(2)
  const { svc } = makeService()

  const result = await svc.completion({
    messages: [{ role: 'user', content: USER }],
    systemPromptOverride: SYSTEM
  })

  t.equal(result.text, 'ASSISTANT TEXT', 'result.text is the assistant answer')
  t.deepEqual(result.usage, { inputTokens: 7, outputTokens: 3 }, 'usage surfaces for the caller')
})

test('completion() still accepts a bare { content } payload', async (t) => {
  t.plan(2)
  const { svc, calls } = makeService()

  await svc.completion({ content: 'summarise this week' })

  t.equal(calls[0].body.content, 'summarise this week', 'content rides as the single user turn')
  t.equal('system' in calls[0].body, false, 'no system key when the caller sends none')
})

test('completion() accepts `system` and `systemRef` under their own names', async (t) => {
  t.plan(2)
  const { svc, calls } = makeService()

  await svc.completion({ content: 'hi', system: SYSTEM, systemRef: 'ticket-synthesis' })

  t.equal(calls[0].body.system, SYSTEM, '`system` is honoured directly')
  t.equal(calls[0].body.systemRef, 'ticket-synthesis', 'a server-stored prompt key is not dropped')
})

test('completion() keeps an explicit modelMode', async (t) => {
  t.plan(1)
  const { svc, calls } = makeService()

  await svc.completion({ content: 'hi', modelMode: 'providers' })

  t.equal(calls[0].body.modelMode, 'providers', 'the caller mode wins over the stored default')
})
