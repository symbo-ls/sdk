import { BaseService } from './BaseService.js'

// AiBoardsService — `ai.boards`: the assistant's Page mode (generated boards on
// the home). Wraps the main server's /core/ai-boards/* routes
// (server src/domains/ai-boards, ASSISTANT_BOARD_MODE_SPEC.md §3).
//
// A board is a SPEC, never UI: installed-app widget recipes with `params`
// plus the six AI block types. The server builds the vocabulary from the
// workspace's installed apps, runs ONE model round trip through the
// assistant's own router, and validates every item against the vocabulary.
// Widgets fetch their own data client-side; generation is read-only.
//
// Every route is workspace-scoped by the PATH (`/ai-boards/workspaces/:ws/…`);
// the workspace defaults to the SDK's active workspace (`_resolveWorkspaceId`).
//
// Streaming: `generate` / `refine` stream named SSE frames when the caller
// passes a callback (onEvent / onStart / onHead / onItem / onDrop):
//   board.start → board.head (title + summary) → board.item … (board.drop …)
//   → board.done (the authoritative spec) | board.error
// and resolve with the done payload. Without a callback they answer one JSON
// envelope through `_call`. POST + fetch reader, not EventSource (GET-only).
//
// Reached as `sdk.getService('aiBoards')` or `sdk.execute('ai.boards', op, args)`
// (route: AI_BOARDS_ENTITY_ROUTE below).

/**
 * @typedef {'s'|'m'|'l'|'xl'} BoardSize
 * @typedef {'numeral'|'text-block'|'list'|'chip-row'|'progress-bars'|'bar-chart'} BoardBlockType
 * @typedef {{ app: string, dataset?: string, range?: string }} BoardSource
 * @typedef {{ id: string, kind: 'widget', widget: string, app: string, size: BoardSize,
 *   params: Object<string, (string|number|boolean)>, title?: string, pinKey: string }} BoardWidgetItem
 * @typedef {{ id: string, kind: 'block', block: BoardBlockType, size: BoardSize, title: string,
 *   data: Object, source?: BoardSource, pinKey: string }} BoardBlockItem
 * @typedef {BoardWidgetItem|BoardBlockItem} BoardItem
 * @typedef {{ v: 1, id: string, prompt: string, title: string, summary: string,
 *   items: BoardItem[], refine: Array<{ label: string, prompt: string }>,
 *   sources: BoardSource[], generatedAt: (string|null), model: (string|null),
 *   threadId?: string, refinedFrom?: string }} BoardSpec
 * @typedef {{ index: number, widget: (string|null), block: (string|null),
 *   reason: ('not_installed'|'unknown_block'|'invalid_block'|'invalid_item'|'limit') }} BoardDrop
 * @typedef {{ spec: BoardSpec, dropped: BoardDrop[],
 *   counts: { requested: number, kept: number, dropped: number }, partial: boolean,
 *   provider: (string|null), model: (string|null),
 *   threadContext: ('used'|'none'|'unavailable'), ms: number }} BoardResult
 * @typedef {{ type: ('string'|'number'|'enum'|'range'|'boolean'), values?: Array<(string|number|boolean)>,
 *   default?: any, describe?: string, min?: number, max?: number }} BoardParamSchema
 * @typedef {{ widget: string, app: string, appId: string, id: string, title: string,
 *   describe: (string|null), icon: (string|null), hue: (string|null), size: BoardSize,
 *   sizes: BoardSize[], params: Object<string, BoardParamSchema> }} BoardVocabularyWidget
 * @typedef {{ v: 1, workspaceId: string,
 *   apps: Array<{ app: string, appId: string, name: string, icon: (string|null), hue: (string|null) }>,
 *   widgets: BoardVocabularyWidget[],
 *   blocks: Array<{ type: BoardBlockType, describe: string, example: Object }>,
 *   sizes: BoardSize[], skipped: Array<{ appId: string, reason: string }> }} BoardVocabulary
 * @typedef {{ id: string, title: string, summary: string, prompt: string,
 *   visibility: ('personal'|'workspace'), layout: Array<{ id: string, size?: BoardSize, hidden?: boolean }>,
 *   pinnedItemIds: string[], itemCount: number, author: (string|null), authorName: (string|null),
 *   threadId: (string|null), model: (string|null), generatedAt: (string|null), workspaceId: string,
 *   createdAt: string, updatedAt: string, viewerCanEdit: boolean, viewerCanDelete: boolean,
 *   viewerCanShare: boolean, spec?: BoardSpec, existing?: boolean }} SavedBoard
 * @typedef {'stat'|'list'|'table'|'chart'} RecordsView
 * @typedef {{ field: string, op: ('eq'|'ne'|'in'|'gte'|'lte'|'between'|'contains'), value: any }} RecordsFilter
 * @typedef {{ kind: 'records', app: string, collection: string, view: RecordsView,
 *   title: { key?: string, text?: string }, filters?: RecordsFilter[],
 *   period?: { field: string, preset: ('today'|'thisWeek'|'thisMonth'|'thisQuarter'|'lastQuarter'|'thisYear') },
 *   aggregate?: { op: ('count'|'sum'|'avg'|'min'|'max'), field?: string }, groupBy?: string,
 *   sort?: { field: string, dir: ('asc'|'desc') }, limit?: number, fields?: string[] }} RecordsBlock
 * @typedef {{ id: string, title: (string|null), values: Object<string, any>, refs?: Object<string, string> }} RecordsRow
 * @typedef {{ key: string, label: string, count: number, value?: number }} RecordsGroup
 * @typedef {{ block: RecordsBlock, adjusted: Array<{ path: string, reason: string }>, rows: RecordsRow[],
 *   total: number, aggregate: { op: string, field?: string, value: (number|null), currency?: string,
 *   byCurrency?: Array<{ currency: string, value: (number|null), count: number }> },
 *   groups: RecordsGroup[], fields: Array<{ key: string, type: string, label?: string, ref?: string }>,
 *   period: ({ field: string, preset: string, from: string, to: string }|null), groupUnit: (string|null),
 *   warnings: string[], scanned: number, truncated: boolean, generatedAt: string }} RecordsResult
 * @typedef {{ id: string, app?: string, kind?: string, count: number,
 *   severity?: ('urgent'|'attention'|'info'), label?: (string|{ key?: string, params?: Object, text?: string }),
 *   href?: string, at?: string }} HomeSignal
 * @typedef {{ signalId: string, app: string, severity: string, count: number, label: (string|null),
 *   labelKey?: string, labelParams?: Object, href?: string }} HomeSummaryChip
 * @typedef {{ text: string, chips: HomeSummaryChip[], generatedAt: string, cached: boolean,
 *   fallback: boolean, reason?: string, model: (string|null), day: string, band: (string|null),
 *   locale: string, signals: { used: number, dropped: number } }} HomeSummary
 * @typedef {{ event: string, data: Object }} BoardStreamEvent
 * @typedef {{ workspaceId?: string, signal?: AbortSignal, stream?: boolean,
 *   onEvent?: function(BoardStreamEvent): void, onStart?: function(Object): void,
 *   onHead?: function({ id: string, title: string, summary: string }): void,
 *   onItem?: function({ id: string, index: number, item: BoardItem }): void,
 *   onDrop?: function(Object): void, shellWidgets?: Object[], modelMode?: string,
 *   capabilities?: { records?: number } }} BoardStreamOptions
 */

const STREAM_CALLBACKS = ['onEvent', 'onStart', 'onHead', 'onItem', 'onDrop']

// The body a generate/refine POST carries — everything but the callbacks,
// the signal and the transport switches.
const generationBody = (args, keys) => {
  const body = {}
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null) body[k] = args[k]
  }
  return body
}

const wantsStream = (args) =>
  args.stream === true ||
  (args.stream !== false && STREAM_CALLBACKS.some((k) => typeof args[k] === 'function'))

// One complete SSE frame → { event, data } | null (comments / heartbeats).
const parseFrame = (frame) => {
  let event = 'message'
  const dataLines = []
  for (const raw of frame.split('\n')) {
    if (raw.startsWith('event:')) event = raw.slice(6).trim()
    else if (raw.startsWith('data:')) dataLines.push(raw.slice(5).replace(/^ /, ''))
  }
  if (!dataLines.length) return null
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

const codedError = (message, { code, status, details } = {}) => {
  const err = new Error(message)
  if (code) err.code = code
  if (status !== undefined) err.status = status
  if (details !== undefined) err.details = details
  return err
}

export class AiBoardsService extends BaseService {
  // ── internals ───────────────────────────────────────────────────────────

  _boardsWorkspace (args = {}) {
    const ws = this._resolveWorkspaceId(args?.workspaceId)
    if (!ws) {
      throw codedError('ai.boards needs a workspace (pass workspaceId or set an active workspace)', {
        code: 'workspace_required'
      })
    }
    return encodeURIComponent(String(ws))
  }

  // `_call` keeps the server's body on `err.cause`; lift its code/details so
  // a caller can branch on `err.code` ('board_limit_reached', …).
  _boardsError (err) {
    const body = err?.cause
    if (body && typeof body === 'object') {
      if (!err.code && typeof body.error === 'string') err.code = body.error
      if (err.details === undefined && body.details !== undefined) err.details = body.details
    }
    throw err
  }

  async _authHeader () {
    if (!this._tokenManager) return null
    try {
      await this._tokenManager.ensureValidToken?.()
    } catch {
      /* proceed with whatever header exists — the server answers 401 */
    }
    return this._tokenManager.getAuthHeader?.() || null
  }

  // POST + named SSE frames → resolves with the `board.done` payload, rejects
  // on `board.error`, an HTTP refusal, or a stream that ends without `done`.
  async _postBoardStream (path, body, args, methodName) {
    this._requireReady(methodName)
    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    const auth = await this._authHeader()
    if (auth) headers.Authorization = auth

    const res = await fetch(`${this._apiUrl}/core${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(args.signal ? { signal: args.signal } : {})
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      let parsed = null
      try { parsed = JSON.parse(text) } catch { /* not JSON */ }
      throw codedError(parsed?.message || `The board request was rejected (HTTP ${res.status}).`, {
        code: parsed?.error || `HTTP_${res.status}`,
        status: res.status,
        details: parsed?.details
      })
    }

    const safe = (fn, arg) => {
      if (typeof fn !== 'function') return
      try { fn(arg) } catch { /* a consumer error never breaks the stream */ }
    }
    const handlers = {
      'board.start': args.onStart,
      'board.head': args.onHead,
      'board.item': args.onItem,
      'board.drop': args.onDrop
    }
    let done = null
    let failure = null
    const dispatch = (parsed) => {
      safe(args.onEvent, parsed)
      if (parsed.event === 'board.done') done = parsed.data
      else if (parsed.event === 'board.error') {
        const d = parsed.data || {}
        failure = codedError(d.message || 'The board could not be built.', {
          code: d.code || 'board_error',
          status: d.status,
          details: d.details
        })
      } else safe(handlers[parsed.event], parsed.data)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const f of frames) {
          const parsed = parseFrame(f)
          if (parsed) dispatch(parsed)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) {
        const parsed = parseFrame(buffer)
        if (parsed) dispatch(parsed)
      }
    } finally {
      try { reader.cancel()?.catch?.(() => {}) } catch { /* already closed */ }
    }
    if (failure) throw failure
    if (!done) {
      throw codedError('The board stream ended before the board was complete.', {
        code: 'stream_incomplete'
      })
    }
    return done
  }

  // ── vocabulary ──────────────────────────────────────────────────────────

  /**
   * The installed-apps widget catalogue (installed apps ∩ the project gate)
   * + the six block types — what a generated board may name.
   * @param {{ workspaceId?: string }} [args]
   * @returns {Promise<BoardVocabulary>}
   */
  async vocabulary (args = {}) {
    const ws = this._boardsWorkspace(args)
    return this._call('aiBoards.vocabulary', `/ai-boards/workspaces/${ws}/vocabulary`).catch((e) =>
      this._boardsError(e)
    )
  }

  // ── records (RECORDS BLOCK v1) ─────────────────────────────────────────

  /**
   * Resolve ONE records block under the caller's grants — the live numbers
   * of a board's `records` item: `{ rows (≤ 50), total, aggregate, groups,
   * fields, period, … }`. Aggregates cover the WHOLE filtered set. Period
   * presets ("thisQuarter") resolve in the viewer's local time: the SDK sends
   * the runtime's UTC offset unless `tzOffsetMinutes` is given.
   * @param {{ workspaceId?: string, block: RecordsBlock, tzOffsetMinutes?: number }} args
   * @returns {Promise<RecordsResult>}
   */
  async records (args = {}) {
    const ws = this._boardsWorkspace(args)
    const tz = Number.isFinite(args.tzOffsetMinutes)
      ? args.tzOffsetMinutes
      : -new Date().getTimezoneOffset()
    return this._call('aiBoards.records', `/ai-boards/workspaces/${ws}/records`, {
      method: 'POST',
      body: { block: args.block, tzOffsetMinutes: tz }
    }).catch((e) => this._boardsError(e))
  }

  // ── summary (the home's AI line) ───────────────────────────────────────

  /**
   * The home's AI summary from the shell's HOME SIGNALS: 2–3 sentences whose
   * numbers come only from the signals, plus deterministic chips. One model
   * call per user / local day / time band / signals; repeats come from the
   * server cache. `hour` and `tzOffsetMinutes` default to the runtime clock.
   * @param {{ workspaceId?: string, signals: HomeSignal[], locale?: string,
   *   hour?: number, tzOffsetMinutes?: number }} args
   * @returns {Promise<HomeSummary>}
   */
  async summary (args = {}) {
    const ws = this._boardsWorkspace(args)
    const tz = Number.isFinite(args.tzOffsetMinutes)
      ? args.tzOffsetMinutes
      : -new Date().getTimezoneOffset()
    const hour = Number.isInteger(args.hour) ? args.hour : new Date().getHours()
    const body = { signals: Array.isArray(args.signals) ? args.signals : [], hour, tzOffsetMinutes: tz }
    if (typeof args.locale === 'string') body.locale = args.locale
    return this._call('aiBoards.summary', `/ai-boards/workspaces/${ws}/summary`, {
      method: 'POST',
      body
    }).catch((e) => this._boardsError(e))
  }

  // ── generate / refine ───────────────────────────────────────────────────
  //
  // `capabilities` declares what THIS client renders: `{ records: 1 }` = it
  // renders RECORDS BLOCK v1 items (resolved with `records`). Without it the
  // server offers no collections and emits no records item — an older shell
  // never shows a block it cannot render.

  /**
   * Generate a board from a prompt — ONE model round trip. Streams when a
   * callback is given (title + summary first, then items), resolves with the
   * done payload either way.
   * @param {BoardStreamOptions & { prompt: string, threadId?: string }} args
   * @returns {Promise<BoardResult>}
   */
  async generate (args = {}) {
    const ws = this._boardsWorkspace(args)
    const body = generationBody(args, ['prompt', 'threadId', 'shellWidgets', 'modelMode', 'capabilities'])
    if (wantsStream(args)) {
      return this._postBoardStream(`/ai-boards/workspaces/${ws}/generate`, body, args, 'aiBoards.generate')
    }
    return this._call('aiBoards.generate', `/ai-boards/workspaces/${ws}/generate`, {
      method: 'POST',
      body
    }).catch((e) => this._boardsError(e))
  }

  /**
   * Refine a board: a saved one by `boardId`, or the client-held generated
   * one by `spec` (the server re-validates it). Same streaming contract as
   * generate; the result carries a NEW board id and `spec.refinedFrom`.
   * @param {BoardStreamOptions & { prompt: string, boardId?: string, spec?: BoardSpec }} args
   * @returns {Promise<BoardResult>}
   */
  async refine (args = {}) {
    const ws = this._boardsWorkspace(args)
    const body = generationBody(args, ['prompt', 'boardId', 'spec', 'shellWidgets', 'modelMode', 'capabilities'])
    if (wantsStream(args)) {
      return this._postBoardStream(`/ai-boards/workspaces/${ws}/refine`, body, args, 'aiBoards.refine')
    }
    return this._call('aiBoards.refine', `/ai-boards/workspaces/${ws}/refine`, {
      method: 'POST',
      body
    }).catch((e) => this._boardsError(e))
  }

  // ── saved boards (`ai_boards`) ──────────────────────────────────────────

  /**
   * Own + workspace-shared saved boards, newest first. Light rows unless
   * `includeSpec`.
   * @param {{ workspaceId?: string, includeSpec?: boolean }} [args]
   * @returns {Promise<SavedBoard[]>}
   */
  async list (args = {}) {
    const ws = this._boardsWorkspace(args)
    const qs = args.includeSpec ? '?includeSpec=1' : ''
    return this._call('aiBoards.list', `/ai-boards/workspaces/${ws}/boards${qs}`).catch((e) =>
      this._boardsError(e)
    )
  }

  /**
   * @param {{ workspaceId?: string, id: string }} args
   * @returns {Promise<SavedBoard>}
   */
  async get (args = {}) {
    const ws = this._boardsWorkspace(args)
    const id = encodeURIComponent(String(args.id || ''))
    return this._call('aiBoards.get', `/ai-boards/workspaces/${ws}/boards/${id}`).catch((e) =>
      this._boardsError(e)
    )
  }

  /**
   * Save a generated board. Idempotent for its author (the same spec id twice
   * answers the existing record with `existing: true`). Sharing
   * (`visibility: 'workspace'`) needs the editor role.
   * @param {{ workspaceId?: string, spec: BoardSpec, title?: string,
   *   visibility?: ('personal'|'workspace'), layout?: Array<Object>,
   *   pinnedItemIds?: string[], threadId?: string }} args
   * @returns {Promise<SavedBoard>}
   */
  async save (args = {}) {
    const ws = this._boardsWorkspace(args)
    const body = generationBody(args, ['spec', 'title', 'visibility', 'layout', 'pinnedItemIds', 'threadId'])
    return this._call('aiBoards.save', `/ai-boards/workspaces/${ws}/boards`, {
      method: 'POST',
      body
    }).catch((e) => this._boardsError(e))
  }

  /**
   * Edit mode + pins + sharing on a saved board.
   * @param {{ workspaceId?: string, id: string, patch: { title?: string,
   *   layout?: Array<{ id: string, size?: BoardSize, hidden?: boolean }>,
   *   pinnedItemIds?: string[], visibility?: ('personal'|'workspace') } }} args
   * @returns {Promise<SavedBoard>}
   */
  async update (args = {}) {
    const ws = this._boardsWorkspace(args)
    const id = encodeURIComponent(String(args.id || ''))
    return this._call('aiBoards.update', `/ai-boards/workspaces/${ws}/boards/${id}`, {
      method: 'PATCH',
      body: args.patch || {}
    }).catch((e) => this._boardsError(e))
  }

  /**
   * Hard delete — by the author, or an editor on a shared board.
   * @param {{ workspaceId?: string, id: string }} args
   * @returns {Promise<{ id: string, deleted: true }>}
   */
  async remove (args = {}) {
    const ws = this._boardsWorkspace(args)
    const id = encodeURIComponent(String(args.id || ''))
    return this._call('aiBoards.remove', `/ai-boards/workspaces/${ws}/boards/${id}`, {
      method: 'DELETE'
    }).catch((e) => this._boardsError(e))
  }
}

// The declarative fetch adapter hands `{ params, filter, … }`; imperative
// callers hand the flat bag. Both become one flat args object.
const flatArgs = (a) => {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return {}
  const { params, filter, ...rest } = a
  return {
    ...(filter && typeof filter === 'object' ? filter : {}),
    ...(params && typeof params === 'object' ? params : {}),
    ...rest
  }
}

/**
 * `sdk.execute('ai.boards', op, args)` — registered in EntityDispatcher's
 * ENTITY_ROUTES (see docs/patches in the server repo for the one-line hand-off).
 */
export const AI_BOARDS_ENTITY_ROUTE = Object.freeze({
  service: 'aiBoards',
  methods: Object.freeze({
    vocabulary: 'vocabulary',
    records: 'records',
    summary: 'summary',
    generate: 'generate',
    refine: 'refine',
    list: 'list',
    get: 'get',
    save: 'save',
    create: 'save',
    update: 'update',
    remove: 'remove',
    delete: 'remove'
  }),
  argMap: Object.freeze({
    vocabulary: (a) => [flatArgs(a)],
    records: (a) => [flatArgs(a)],
    summary: (a) => [flatArgs(a)],
    generate: (a) => [flatArgs(a)],
    refine: (a) => [flatArgs(a)],
    list: (a) => [flatArgs(a)],
    get: (a) => [flatArgs(a)],
    save: (a) => [flatArgs(a)],
    create: (a) => [flatArgs(a)],
    update: (a) => [flatArgs(a)],
    remove: (a) => [flatArgs(a)],
    delete: (a) => [flatArgs(a)]
  })
})

export default AiBoardsService
