import test from 'tape'
import sinon from 'sinon'
import { AiBoardsService, AI_BOARDS_ENTITY_ROUTE } from '../../AiBoardsService.js'
import { createEntityDispatcher, registerEntity } from '../../EntityDispatcher.js'

// CORE-AI-BOARDS-GENERATE-VOCABULARY-1 — sdk `ai.boards` wraps
// /core/ai-boards/* (server domain src/domains/ai-boards). Every route is
// workspace-scoped by the PATH; generate/refine stream named SSE frames
// (board.start → board.head → board.item… → board.done) when a callback is
// given, and answer one JSON envelope otherwise.

const sandbox = sinon.createSandbox()

const makeService = ({ workspace = 'ws-active' } = {}) => {
  const svc = new AiBoardsService()
  svc._apiUrl = 'https://api.test'
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveWorkspaceId').callsFake((explicit) => explicit || workspace)
  return svc
}

// A fetch Response whose body streams the given text in small chunks.
const sseResponse = (text, { status = 200, chunk = 23 } = {}) => {
  const bytes = new TextEncoder().encode(text)
  let i = 0
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= bytes.length) return { done: true, value: undefined }
          const value = bytes.slice(i, i + chunk)
          i += chunk
          return { done: false, value }
        },
        cancel: () => Promise.resolve()
      })
    },
    text: async () => text
  }
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

const SPEC = {
  v: 1,
  id: 'brd_0000000000000001',
  prompt: 'How are Q3 viewings going?',
  title: 'Q3 viewings',
  summary: '42 viewings in Q3.',
  items: [
    { id: 'i1', kind: 'widget', widget: 'scheduling.bookings-trend', app: 'scheduling', size: 'xl', params: { group: 'week' }, pinKey: 'pk_1' },
    { id: 'i2', kind: 'widget', widget: 'crm.deals-stuck', app: 'crm', size: 'm', params: { stage: 'proposal' }, pinKey: 'pk_2' }
  ],
  refine: [],
  sources: [],
  generatedAt: '2026-09-27T00:00:00.000Z',
  model: 'gemini-2.5-flash'
}
const DONE = { spec: SPEC, dropped: [], counts: { requested: 2, kept: 2, dropped: 0 }, partial: false, provider: 'gemini', model: 'gemini-2.5-flash', threadContext: 'none', ms: 1234 }

const STREAM =
  frame('board.start', { id: SPEC.id, v: 1, prompt: SPEC.prompt }) +
  ': keep-alive\n\n' +
  frame('board.head', { id: SPEC.id, title: SPEC.title, summary: SPEC.summary }) +
  frame('board.item', { id: SPEC.id, index: 0, item: SPEC.items[0] }) +
  frame('board.drop', { id: SPEC.id, index: 1, widget: 'hr.headcount', block: null, reason: 'not_installed' }) +
  frame('board.item', { id: SPEC.id, index: 1, item: SPEC.items[1] }) +
  frame('board.done', DONE)

// ─── reads + records ─────────────────────────────────────────────────────────

test('vocabulary GETs the workspace-scoped path', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ widgets: [], blocks: [] })
  await svc.vocabulary()
  t.deepEqual(stub.firstCall.args.slice(0, 2), ['aiBoards.vocabulary', '/ai-boards/workspaces/ws-active/vocabulary'])
  await svc.vocabulary({ workspaceId: 'ws explicit' })
  t.equal(stub.secondCall.args[1], '/ai-boards/workspaces/ws%20explicit/vocabulary', 'an explicit workspace wins, encoded')
  sandbox.restore()
  t.end()
})

test('list / get / save / update / remove hit their routes with the right verbs and bodies', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list()
  await svc.list({ includeSpec: true })
  await svc.get({ id: 'brd_0000000000000001' })
  await svc.save({ spec: SPEC, visibility: 'workspace', pinnedItemIds: ['i1'] })
  await svc.update({ id: 'brd_0000000000000001', patch: { layout: [{ id: 'i2', size: 'l' }] } })
  await svc.remove({ id: 'brd_0000000000000001' })
  const calls = stub.getCalls().map((c) => [c.args[0], c.args[1], c.args[2]?.method || 'GET', c.args[2]?.body])
  t.deepEqual(calls, [
    ['aiBoards.list', '/ai-boards/workspaces/ws-active/boards', 'GET', undefined],
    ['aiBoards.list', '/ai-boards/workspaces/ws-active/boards?includeSpec=1', 'GET', undefined],
    ['aiBoards.get', '/ai-boards/workspaces/ws-active/boards/brd_0000000000000001', 'GET', undefined],
    ['aiBoards.save', '/ai-boards/workspaces/ws-active/boards', 'POST', { spec: SPEC, visibility: 'workspace', pinnedItemIds: ['i1'] }],
    ['aiBoards.update', '/ai-boards/workspaces/ws-active/boards/brd_0000000000000001', 'PATCH', { layout: [{ id: 'i2', size: 'l' }] }],
    ['aiBoards.remove', '/ai-boards/workspaces/ws-active/boards/brd_0000000000000001', 'DELETE', undefined]
  ])
  sandbox.restore()
  t.end()
})

test('no workspace anywhere → a typed error before any request', async (t) => {
  const svc = makeService({ workspace: null })
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.list()
    t.fail('should throw')
  } catch (e) {
    t.equal(e.code, 'workspace_required')
  }
  t.equal(stub.callCount, 0)
  sandbox.restore()
  t.end()
})

test('a server refusal keeps its code and details (err.code, err.details)', async (t) => {
  const svc = makeService()
  const httpErr = Object.assign(new Error('this workspace already has the maximum of 100 saved boards'), {
    status: 409,
    cause: { success: false, error: 'board_limit_reached', message: 'max', details: { cap: 100 } }
  })
  sandbox.stub(svc, '_call').rejects(httpErr)
  try {
    await svc.save({ spec: SPEC })
    t.fail('should throw')
  } catch (e) {
    t.equal(e.status, 409)
    t.equal(e.code, 'board_limit_reached')
    t.deepEqual(e.details, { cap: 100 })
  }
  sandbox.restore()
  t.end()
})

// ─── generate / refine ───────────────────────────────────────────────────────

test('generate without callbacks → one JSON POST through _call', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(DONE)
  const result = await svc.generate({ prompt: 'How are Q3 viewings going?', threadId: 't-1' })
  t.deepEqual(stub.firstCall.args, [
    'aiBoards.generate',
    '/ai-boards/workspaces/ws-active/generate',
    { method: 'POST', body: { prompt: 'How are Q3 viewings going?', threadId: 't-1' } }
  ])
  t.deepEqual(result, DONE)
  sandbox.restore()
  t.end()
})

test('generate with callbacks streams: start → head → items (+drop) → resolves with done', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves('Bearer tok')
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves(sseResponse(STREAM))
  const seen = []
  const result = await svc.generate({
    prompt: 'How are Q3 viewings going?',
    onStart: (d) => seen.push(['start', d.id]),
    onHead: (d) => seen.push(['head', d.title]),
    onItem: (d) => seen.push(['item', d.index, d.item.widget]),
    onDrop: (d) => seen.push(['drop', d.widget, d.reason])
  })
  const [url, init] = fetchStub.firstCall.args
  t.equal(url, 'https://api.test/core/ai-boards/workspaces/ws-active/generate')
  t.equal(init.method, 'POST')
  t.equal(init.headers.Accept, 'text/event-stream')
  t.equal(init.headers.Authorization, 'Bearer tok')
  t.deepEqual(JSON.parse(init.body), { prompt: 'How are Q3 viewings going?' }, 'callbacks never ride the body')
  t.deepEqual(seen, [
    ['start', SPEC.id],
    ['head', 'Q3 viewings'],
    ['item', 0, 'scheduling.bookings-trend'],
    ['drop', 'hr.headcount', 'not_installed'],
    ['item', 1, 'crm.deals-stuck']
  ])
  t.deepEqual(result, DONE, 'resolves with the done payload (the authoritative spec)')
  sandbox.restore()
  t.end()
})

test('onEvent sees every named frame, in order', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  sandbox.stub(globalThis, 'fetch').resolves(sseResponse(STREAM, { chunk: 7 }))
  const events = []
  await svc.generate({ prompt: 'p', onEvent: ({ event }) => events.push(event) })
  t.deepEqual(events, ['board.start', 'board.head', 'board.item', 'board.drop', 'board.item', 'board.done'])
  sandbox.restore()
  t.end()
})

test('a board.error frame rejects with its code, status and details', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  const text = frame('board.start', { id: 'brd_1', v: 1 }) + frame('board.error', { code: 'ai_cap_exceeded', message: 'monthly AI limit', status: 402 })
  sandbox.stub(globalThis, 'fetch').resolves(sseResponse(text))
  try {
    await svc.generate({ prompt: 'p', onHead: () => {} })
    t.fail('should reject')
  } catch (e) {
    t.equal(e.code, 'ai_cap_exceeded')
    t.equal(e.status, 402)
    t.equal(e.message, 'monthly AI limit')
  }
  sandbox.restore()
  t.end()
})

test('an HTTP refusal before the stream (e.g. 400 invalid_prompt) rejects with the server code', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  const body = JSON.stringify({ success: false, error: 'invalid_prompt', message: 'a prompt is required' })
  sandbox.stub(globalThis, 'fetch').resolves({ ok: false, status: 400, body: null, text: async () => body })
  try {
    await svc.generate({ prompt: 'x', onHead: () => {} })
    t.fail('should reject')
  } catch (e) {
    t.equal(e.status, 400)
    t.equal(e.code, 'invalid_prompt')
    t.equal(e.message, 'a prompt is required')
  }
  sandbox.restore()
  t.end()
})

test('a stream that ends without board.done rejects (never resolves undefined)', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  sandbox.stub(globalThis, 'fetch').resolves(sseResponse(frame('board.start', { id: 'brd_1' }) + frame('board.head', { id: 'brd_1', title: 'T' })))
  try {
    await svc.generate({ prompt: 'p', onHead: () => {} })
    t.fail('should reject')
  } catch (e) {
    t.equal(e.code, 'stream_incomplete')
  }
  sandbox.restore()
  t.end()
})

test('a throwing consumer callback never breaks the stream', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  sandbox.stub(globalThis, 'fetch').resolves(sseResponse(STREAM))
  const result = await svc.generate({ prompt: 'p', onItem: () => { throw new Error('ui bug') } })
  t.deepEqual(result, DONE)
  sandbox.restore()
  t.end()
})

test('the caller signal rides the fetch (cancel = abort)', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves(sseResponse(STREAM))
  const ac = new AbortController()
  await svc.generate({ prompt: 'p', onHead: () => {}, signal: ac.signal })
  t.equal(fetchStub.firstCall.args[1].signal, ac.signal)
  sandbox.restore()
  t.end()
})

test('refine streams to /refine with boardId or the client-held spec', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  const fetchStub = sandbox.stub(globalThis, 'fetch').callsFake(async () => sseResponse(STREAM))
  await svc.refine({ spec: SPEC, prompt: 'Only Argo units', onItem: () => {} })
  await svc.refine({ boardId: 'brd_0000000000000001', prompt: 'Compare with Q2', onItem: () => {} })
  t.equal(fetchStub.firstCall.args[0], 'https://api.test/core/ai-boards/workspaces/ws-active/refine')
  t.deepEqual(JSON.parse(fetchStub.firstCall.args[1].body), { prompt: 'Only Argo units', spec: SPEC })
  t.deepEqual(JSON.parse(fetchStub.secondCall.args[1].body), { prompt: 'Compare with Q2', boardId: 'brd_0000000000000001' })
  sandbox.restore()
  t.end()
})

test('refine without callbacks → one JSON POST through _call', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(DONE)
  await svc.refine({ boardId: 'brd_0000000000000001', prompt: 'x' })
  t.deepEqual(stub.firstCall.args.slice(0, 2), ['aiBoards.refine', '/ai-boards/workspaces/ws-active/refine'])
  t.deepEqual(stub.firstCall.args[2].body, { prompt: 'x', boardId: 'brd_0000000000000001' })
  sandbox.restore()
  t.end()
})

// ─── sdk.execute('ai.boards', …) ─────────────────────────────────────────────

test("sdk.execute('ai.boards', op) reaches the service for every op (dispatch, not a code read)", async (t) => {
  registerEntity('ai.boards', AI_BOARDS_ENTITY_ROUTE)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'aiBoards' ? svc : null) })
  await execute('ai.boards', 'vocabulary', { workspaceId: 'ws-1' })
  await execute('ai.boards', 'list', { workspaceId: 'ws-1' })
  await execute('ai.boards', 'get', { workspaceId: 'ws-1', id: 'brd_0000000000000001' })
  await execute('ai.boards', 'save', { workspaceId: 'ws-1', spec: SPEC })
  await execute('ai.boards', 'create', { workspaceId: 'ws-1', spec: SPEC })
  await execute('ai.boards', 'update', { workspaceId: 'ws-1', id: 'brd_0000000000000001', patch: { title: 'x' } })
  await execute('ai.boards', 'remove', { workspaceId: 'ws-1', id: 'brd_0000000000000001' })
  await execute('ai.boards', 'generate', { workspaceId: 'ws-1', prompt: 'p' })
  await execute('ai.boards', 'refine', { workspaceId: 'ws-1', boardId: 'brd_0000000000000001', prompt: 'p' })
  t.deepEqual(
    stub.getCalls().map((c) => c.args[0]),
    ['aiBoards.vocabulary', 'aiBoards.list', 'aiBoards.get', 'aiBoards.save', 'aiBoards.save', 'aiBoards.update', 'aiBoards.remove', 'aiBoards.generate', 'aiBoards.refine']
  )
  t.equal(stub.getCall(1).args[1], '/ai-boards/workspaces/ws-1/boards')
  sandbox.restore()
  t.end()
})

test('the declarative fetch shape ({ params }) is unwrapped for reads', async (t) => {
  registerEntity('ai.boards', AI_BOARDS_ENTITY_ROUTE)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  const execute = createEntityDispatcher({ getService: () => svc })
  await execute('ai.boards', 'list', { params: { workspaceId: 'ws-9', includeSpec: true } })
  t.equal(stub.firstCall.args[1], '/ai-boards/workspaces/ws-9/boards?includeSpec=1')
  sandbox.restore()
  t.end()
})

// ─── records (RECORDS BLOCK v1) ──────────────────────────────────────────────

const CASE1 = {
  kind: 'records',
  app: 'workspace',
  collection: 'booking',
  view: 'stat',
  title: { text: 'Viewings in Q3' },
  filters: [{ field: 'kind', op: 'eq', value: 'viewing' }],
  period: { field: 'startAt', preset: 'thisQuarter' }
}

test('records POSTs the block to the workspace-scoped path with the runtime UTC offset', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ total: 26, aggregate: { op: 'count', value: 26 } })
  const out = await svc.records({ block: CASE1 })
  t.equal(out.total, 26, 'the envelope data is returned as is')
  t.deepEqual(stub.firstCall.args, [
    'aiBoards.records',
    '/ai-boards/workspaces/ws-active/records',
    { method: 'POST', body: { block: CASE1, tzOffsetMinutes: -new Date().getTimezoneOffset() } }
  ])
  await svc.records({ workspaceId: 'ws-twin', block: CASE1, tzOffsetMinutes: 240 })
  t.equal(stub.secondCall.args[1], '/ai-boards/workspaces/ws-twin/records')
  t.equal(stub.secondCall.args[2].body.tzOffsetMinutes, 240, 'an explicit offset wins')
  sandbox.restore()
  t.end()
})

test("sdk.execute('ai.boards', 'records', { workspaceId, block }) — the UI lane's call", async (t) => {
  registerEntity('ai.boards', AI_BOARDS_ENTITY_ROUTE)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ total: 3 })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'aiBoards' ? svc : null) })
  const out = await execute('ai.boards', 'records', { workspaceId: 'ws-1', block: CASE1 })
  t.equal(out.total, 3)
  t.equal(stub.firstCall.args[0], 'aiBoards.records')
  t.equal(stub.firstCall.args[1], '/ai-boards/workspaces/ws-1/records')
  t.deepEqual(stub.firstCall.args[2].body.block, CASE1, 'the block travels untouched (filters is not the fetch `filter`)')
  // the declarative fetch shape
  await execute('ai.boards', 'records', { params: { workspaceId: 'ws-2', block: CASE1 } })
  t.equal(stub.secondCall.args[1], '/ai-boards/workspaces/ws-2/records')
  sandbox.restore()
  t.end()
})

test('a records refusal keeps its code and details (unknown collection → 422 invalid_block)', async (t) => {
  const svc = makeService()
  const httpErr = Object.assign(new Error('the records block cannot be answered'), {
    status: 422,
    cause: { success: false, error: 'invalid_block', message: 'x', details: { reason: 'unknown_collection', collection: 'viewings' } }
  })
  sandbox.stub(svc, '_call').rejects(httpErr)
  try {
    await svc.records({ block: { ...CASE1, collection: 'viewings' } })
    t.fail('should throw')
  } catch (e) {
    t.equal(e.code, 'invalid_block')
    t.equal(e.details.reason, 'unknown_collection')
  }
  sandbox.restore()
  t.end()
})

// ─── summary (the home's AI line) ────────────────────────────────────────────

const SIGNALS = [
  { id: 'crm.followups.overdue', app: 'crm', kind: 'overdue', count: 47, severity: 'urgent', label: { key: 'crm.signals.followupsOverdue', params: { count: 47 }, text: '47 follow-ups overdue' }, href: '/crm/followups?due=overdue' }
]

test('summary POSTs the signals with the locale, the local hour and the UTC offset', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ text: '47 follow-ups are overdue.', chips: [], cached: false })
  const out = await svc.summary({ signals: SIGNALS, locale: 'ka', hour: 9, tzOffsetMinutes: 240 })
  t.equal(out.text, '47 follow-ups are overdue.')
  t.deepEqual(stub.firstCall.args, [
    'aiBoards.summary',
    '/ai-boards/workspaces/ws-active/summary',
    { method: 'POST', body: { signals: SIGNALS, hour: 9, tzOffsetMinutes: 240, locale: 'ka' } }
  ])
  await svc.summary({ workspaceId: 'ws-2' })
  const body = stub.secondCall.args[2].body
  t.deepEqual(body.signals, [], 'no signals → an empty list, never undefined')
  t.equal(body.hour, new Date().getHours(), 'the runtime hour by default')
  t.equal(body.tzOffsetMinutes, -new Date().getTimezoneOffset())
  t.equal('locale' in body, false, 'no locale → the server default')
  sandbox.restore()
  t.end()
})

test("sdk.execute('ai.boards', 'summary', …) reaches the service", async (t) => {
  registerEntity('ai.boards', AI_BOARDS_ENTITY_ROUTE)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ text: '' })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'aiBoards' ? svc : null) })
  await execute('ai.boards', 'summary', { workspaceId: 'ws-1', signals: SIGNALS, locale: 'en', hour: 20 })
  t.equal(stub.firstCall.args[0], 'aiBoards.summary')
  t.equal(stub.firstCall.args[1], '/ai-boards/workspaces/ws-1/summary')
  t.equal(stub.firstCall.args[2].body.hour, 20)
  sandbox.restore()
  t.end()
})

// ─── the client capability gate ──────────────────────────────────────────────

test('generate / refine carry `capabilities` (what this client renders); absent = not sent', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(DONE)
  await svc.generate({ prompt: 'p', capabilities: { records: 1 } })
  await svc.refine({ prompt: 'p', spec: SPEC, capabilities: { records: 1 } })
  await svc.generate({ prompt: 'p' })
  t.deepEqual(stub.getCall(0).args[2].body, { prompt: 'p', capabilities: { records: 1 } })
  t.deepEqual(stub.getCall(1).args[2].body.capabilities, { records: 1 })
  t.equal('capabilities' in stub.getCall(2).args[2].body, false, 'an old caller sends nothing')
  sandbox.restore()
  t.end()
})

// ─── Presentation mode: a DECK (server deck contract v1) ─────────────────────

test('generate / refine carry `mode` (presentation = a deck); absent = not sent', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(DONE)
  await svc.generate({ prompt: 'Present our Q3 sales', mode: 'presentation', capabilities: { records: 1 } })
  await svc.refine({ prompt: 'shorter', mode: 'presentation', boardId: 'brd_1' })
  await svc.generate({ prompt: 'p' })
  t.deepEqual(stub.getCall(0).args[2].body, {
    prompt: 'Present our Q3 sales',
    capabilities: { records: 1 },
    mode: 'presentation'
  })
  t.equal(stub.getCall(1).args[2].body.mode, 'presentation', 'refine carries it too')
  t.equal('mode' in stub.getCall(2).args[2].body, false, 'a board request sends no mode')
  sandbox.restore()
  t.end()
})

test('a deck streams slide by slide: onSlide gets each board.slide frame; done resolves the deck', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_authHeader').resolves(null)
  const DECK = { v: 1, kind: 'deck', id: 'brd_d1', title: 'Q3', slides: [{ id: 's1', kind: 'title', title: 'Q3' }] }
  const DECK_DONE = { spec: DECK, dropped: [], counts: { slides: 2, items: 1, dropped: 0 } }
  const deckStream =
    frame('board.start', { id: 'brd_d1', v: 1, kind: 'deck', prompt: 'p' }) +
    frame('board.head', { id: 'brd_d1', title: 'Q3', summary: '' }) +
    frame('board.slide', { id: 'brd_d1', index: 0, slide: { id: 's1', kind: 'title', title: 'Q3' } }) +
    frame('board.slide', { id: 'brd_d1', index: 1, slide: { id: 's2', kind: 'content', title: 'Pipeline', items: [] } }) +
    frame('board.done', DECK_DONE)
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves(sseResponse(deckStream, { chunk: 11 }))
  const slides = []
  const result = await svc.generate({ prompt: 'p', mode: 'presentation', onSlide: (d) => slides.push([d.index, d.slide.id]) })
  t.deepEqual(JSON.parse(fetchStub.firstCall.args[1].body), { prompt: 'p', mode: 'presentation' }, 'onSlide alone opens the stream; the mode rides the body')
  t.deepEqual(slides, [[0, 's1'], [1, 's2']])
  t.deepEqual(result, DECK_DONE)
  sandbox.restore()
  t.end()
})
