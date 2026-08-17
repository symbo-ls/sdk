import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Regression for tickets/sonnet.md "a stale cached conversation id
// permanently bricks the workspace AI" — the "widens the fix" follow-up
// left explicitly NOT-implemented in the first pass (sdk `54f6307`):
//
//   "The cache key is scoped by workspace id only —
//   `symbols_ai_conversation_${wsId}` — with nothing in it identifying the
//   API plane. So an id minted against one backend is retrieved and used
//   against a different one, for the same workspace... Scope the key by
//   API base as well as workspace id (e.g. include a hash of `_apiUrl`),
//   so ids minted against different backends cannot collide in the first
//   place."
//
// This is now true: `AiService._planeTag()` folds a fingerprint of
// `_apiUrl` into the conversation cache key. These tests prove the two
// halves of the acceptance directly:
//   1. `_planeTag()` differs across API bases and is stable for one.
//   2. Two planes sharing one workspace id never read or clobber each
//      other's cached conversation id — each keeps its OWN slot.
//
// Same stubbing pattern as the sibling staleConversation404.test.js file:
// stub `_streamSSE`/`_requestExternal`, no network, no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('_planeTag() differs across API bases and is stable for the same one', (t) => {
  t.plan(4)
  const svc = new AiService()

  svc._apiUrl = 'https://dev.api.symbols.app'
  const tagDev1 = svc._planeTag()
  const tagDev2 = svc._planeTag()
  t.equal(tagDev1, tagDev2, 'the same _apiUrl always fingerprints the same')

  svc._apiUrl = 'http://localhost:8080'
  const tagLocal = svc._planeTag()
  t.notEqual(tagDev1, tagLocal, 'a different _apiUrl fingerprints differently')

  svc._apiUrl = null
  t.doesNotThrow(() => svc._planeTag(), 'a missing _apiUrl does not throw')
  t.ok(
    typeof svc._planeTag() === 'string' && svc._planeTag().length > 0,
    'still returns a non-empty tag'
  )
})

test('two API planes sharing one workspace id keep independent conversation cache slots', async (t) => {
  t.plan(6)

  const svc = new AiService()
  sandbox.stub(svc, '_activeWorkspaceId').returns('ws-shared')
  sandbox.stub(svc, '_streamSSE').callsFake(() => () => {})

  const store = {}
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    }
  }

  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.createConversation') {
      // Distinguish which plane minted the conversation by echoing the
      // service's current _apiUrl into the id — proves each call created a
      // plane-appropriate id rather than reusing the other plane's.
      const mintedFor = svc._apiUrl
      return Promise.resolve({ data: { id: `conv-for(${mintedFor})` } })
    }
    if (opts.methodName === 'ai.appendMessage') {
      return Promise.resolve({
        assistantMessage: {
          id: 'm-1',
          content: [{ type: 'text', text: `answered on ${svc._apiUrl}` }]
        }
      })
    }
    return Promise.resolve({})
  })

  // --- Plane A: dev.api ---
  svc._apiUrl = 'https://dev.api.symbols.app'
  const planeA = svc._planeTag()
  const keyA = `symbols_ai_conversation_ws-shared_${planeA}`

  let doneA
  const onDoneA = (r) => {
    doneA = r
  }
  svc._streamWorkspaceTurn(
    { text: 'hello from A' },
    { onDone: onDoneA, onError: sinon.spy() }
  )
  await flush()
  await flush()

  t.equal(
    store[keyA],
    'conv-for(https://dev.api.symbols.app)',
    'plane A minted and cached its own conversation id under its own key'
  )
  t.ok(
    doneA && doneA.text === 'answered on https://dev.api.symbols.app',
    'plane A turn completed against its own backend'
  )

  // --- Plane B: local :8080, SAME workspace id ---
  svc._apiUrl = 'http://localhost:8080'
  const planeB = svc._planeTag()
  const keyB = `symbols_ai_conversation_ws-shared_${planeB}`
  t.notEqual(
    keyA,
    keyB,
    'the two planes resolve to different cache keys for the same workspace id'
  )

  let doneB
  const onDoneB = (r) => {
    doneB = r
  }
  svc._streamWorkspaceTurn(
    { text: 'hello from B' },
    { onDone: onDoneB, onError: sinon.spy() }
  )
  await flush()
  await flush()

  t.equal(
    store[keyB],
    'conv-for(http://localhost:8080)',
    "plane B minted its OWN conversation id — it never read plane A's cached id"
  )
  t.ok(
    doneB && doneB.text === 'answered on http://localhost:8080',
    'plane B turn completed against its own backend'
  )

  // --- Back to plane A: its slot must be untouched by plane B's write ---
  t.equal(
    store[keyA],
    'conv-for(https://dev.api.symbols.app)',
    "plane A's cache entry survives plane B's turn unclobbered"
  )
})
