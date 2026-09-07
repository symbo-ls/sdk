import test from 'tape'
import sinon from 'sinon'
import {
  AiService,
  messageSources,
  messageConfidence,
  messageSuggestions
} from '../../AiService.js'

// Sources + confidence + structured attachments — the SDK half of the
// assistant-grounding contract (server spec §4.1–§4.3).
//
// Three properties are pinned here, and each one is a place the wire has
// silently dropped a field before:
//
//   1. `context.attached` RIDES the message POST unchanged. The server owns the
//      validation and the caps; an SDK that re-shaped the bag would be a second
//      copy of that contract, drifting. So the assertion is byte-equality, not
//      "looks similar".
//   2. the resolved `dispatch()` value carries `sources` + `confidence` as
//      first-class fields. They already sit on `metadata`, but a consumer
//      rendering source chips and a confidence pill should not have to know
//      that — and the surfaces that DO reach into `metadata` are exactly the
//      ones that broke when `metadata` itself was not threaded through.
//   3. a turn that produced neither gets `[]` and `null`, never `undefined` —
//      a renderer distinguishes "no sources" from "field missing", and older
//      servers send nothing at all.
//
// Same rig as the sibling attachments/dispatchMetadata tests: `_streamSSE` and
// `_requestExternal` are stubbed, so there is no network and no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const SOURCES = [
  {
    ref: 'ref:record:vault.items/i-1',
    type: 'record',
    id: 'vault.items/i-1',
    title: 'Longbow SPA',
    use: 'warranty cap, cl. 9',
    verified: true
  },
  {
    ref: 'ref:doc:66aa',
    type: 'doc',
    id: '66aa',
    title: 'Board memo',
    use: 'approval date',
    verified: false
  }
]

const CONFIDENCE = {
  score: 0.62,
  band: 'moderate',
  bandLabel: 'Moderate',
  tone: 'accent',
  breakdown: {
    precedent: 0.5,
    coverage: 0.67,
    authority: 0.7,
    freshness: 0.8,
    consistency: 1,
    self: 0.72
  },
  caps: ['only one source supports this'],
  reason: 'Grounded in a single source. Held back because only one source supports this.',
  sourceCount: 2,
  escalate: false,
  stated: true
}

const makeStreamService = () => {
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
  const posts = []
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.appendMessage') {
      posts.push(opts.body)
      return Promise.resolve({
        assistantMessage: {
          _id: 'm2',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          metadata: { sources: SOURCES, confidence: CONFIDENCE, sourcesStated: true }
        }
      })
    }
    return Promise.resolve({ data: { id: 'conv-1' } })
  })
  return { svc, posts }
}

const makeDispatchService = () => {
  const svc = new AiService()
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
  return svc
}

// ── 1. attached forwarding ──────────────────────────────────────────────────

test('context.attached rides the message POST body UNCHANGED', async (t) => {
  t.plan(4)
  const { svc, posts } = makeStreamService()
  const attached = {
    refs: [
      { type: 'record', id: 'vault.items/i-1', title: 'Longbow SPA' },
      { type: 'mail', id: '6a9d#6a9e' }
    ],
    canvas: {
      projectId: 'proj-1',
      boardPageId: 'board-2',
      title: 'Longbow warranty',
      nodes: [
        {
          key: 'ref:record:vault.items/i-1',
          ref: 'ref:record:vault.items/i-1',
          title: 'Longbow SPA',
          kind: 'contract',
          status: 'approved',
          effectiveDate: '2024-03-01',
          summary: 'Share purchase agreement'
        }
      ],
      connections: [
        {
          from: 'ref:record:vault.items/i-1',
          to: 'ref:doc:66aa',
          kind: 'supersedes',
          label: 'supersedes'
        }
      ]
    }
  }

  svc._streamWorkspaceTurn(
    { content: 'what is the warranty cap?', context: { currentPage: '/vault-training', attached } },
    {}
  )
  await flush()

  t.equal(posts.length, 1, 'one message POST')
  t.deepEqual(posts[0].context.attached, attached, 'the whole attached bag reaches the server verbatim')
  t.equal(posts[0].context.currentPage, '/vault-training', 'page awareness still rides beside it')
  t.equal(posts[0].content, 'what is the warranty cap?', 'the question still rides beside it')
})

test('a turn with no attachment posts the context it was given, unchanged', async (t) => {
  t.plan(2)
  const { svc, posts } = makeStreamService()
  svc._streamWorkspaceTurn({ content: 'hi', context: { currentPage: '/home' } }, {})
  await flush()
  t.deepEqual(posts[0].context, { currentPage: '/home' }, 'no attached key is invented')
  t.equal('attached' in posts[0].context, false, 'the key is absent, not an empty object')
})

// ── 2. the answer carries sources + confidence ──────────────────────────────

test('_streamWorkspaceTurn onDone carries sources + confidence off the assistant metadata', async (t) => {
  t.plan(4)
  const { svc } = makeStreamService()
  const done = await new Promise((resolve) => {
    svc._streamWorkspaceTurn({ content: 'ground this' }, { onDone: resolve })
  })
  t.deepEqual(done.sources, SOURCES, 'the source list rides the done payload')
  t.deepEqual(done.confidence, CONFIDENCE, 'the computed confidence verdict rides it too')
  t.equal(done.sources[1].verified, false, 'an unverified citation is preserved, not filtered out')
  t.equal(done.metadata.sourcesStated, true, 'the raw metadata is still forwarded whole')
})

test('dispatch() result carries sources + confidence as first-class fields', async (t) => {
  t.plan(3)
  const svc = makeDispatchService()
  sandbox.stub(svc, '_streamWorkspaceTurn').callsFake((payload, callbacks) => {
    callbacks.onDone({
      text: 'The warranty cap is 20% of consideration.',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      suggestions: [],
      sources: SOURCES,
      confidence: CONFIDENCE,
      metadata: { sources: SOURCES, confidence: CONFIDENCE }
    })
    return () => {}
  })

  const result = await svc.dispatch({ text: 'warranty cap?', workspaceId: 'ws-1' })
  t.deepEqual(result.sources, SOURCES, 'sources on the resolved dispatch value')
  t.deepEqual(result.confidence, CONFIDENCE, 'confidence on the resolved dispatch value')
  t.equal(result.confidence.band, 'moderate', 'the band a UI renders is intact')
})

test('dispatch() defaults sources to [] and confidence to null, never undefined', async (t) => {
  t.plan(2)
  const svc = makeDispatchService()
  sandbox.stub(svc, '_streamWorkspaceTurn').callsFake((payload, callbacks) => {
    callbacks.onDone({
      text: 'Hello.',
      conversationId: 'conv-1',
      messageId: 'msg-2',
      suggestions: []
      // no sources / confidence — an older server, or a turn that produced none
    })
    return () => {}
  })

  const result = await svc.dispatch({ text: 'hi', workspaceId: 'ws-1' })
  t.deepEqual(result.sources, [], 'sources is an empty array, not undefined')
  t.equal(result.confidence, null, 'confidence is explicitly null, not undefined')
})

// ── 3. the exported metadata readers ────────────────────────────────────────

test('messageSources / messageConfidence / messageSuggestions read a serialized message safely', (t) => {
  t.plan(8)
  const msg = {
    metadata: {
      sources: SOURCES,
      confidence: CONFIDENCE,
      suggestions: [{ label: 'Open the SPA', prompt: 'Open the Longbow SPA' }]
    }
  }
  t.deepEqual(messageSources(msg), SOURCES, 'sources')
  t.deepEqual(messageConfidence(msg), CONFIDENCE, 'confidence')
  t.equal(messageSuggestions(msg).length, 1, 'suggestions')

  t.deepEqual(messageSources({}), [], 'no metadata → []')
  t.deepEqual(messageSources(null), [], 'null message → []')
  t.equal(messageConfidence({ metadata: {} }), null, 'no confidence key → null')
  t.equal(messageConfidence({ metadata: { confidence: 'high' } }), null, 'a non-object is refused')
  t.deepEqual(messageSuggestions({ metadata: { suggestions: 'nope' } }), [], 'a non-array is refused')
})
