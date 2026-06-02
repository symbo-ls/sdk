import { BaseService } from './BaseService.js'

// AiService — single entry point for every UI surface that talks to an
// LLM (AppAssistant, CanvasPromptTextarea, ticket standup/detail editor,
// meet transcript analysis, the simone extension, …).
//
// Three modes the user can pick from, persisted in localStorage:
//
//   1. 'simone' (default) — POST /ai-chat/stream → main server hits
//      Symbols Service (https://symbols-service-production.up.railway.app)
//      which uses managed Anthropic/OpenAI keys. Zero local setup, lowest
//      friction. Same path the AiChatService.stream method already takes.
//
//   2. 'providers' — POST /ai-chat/stream with an explicit `mode:'providers'`
//      hint. The server routes through @symbo.ls/ai-providers'
//      ModelRouterService which picks the best provider (Anthropic / OpenAI
//      / OpenRouter / Gemini) per task type and uses YOUR org's keys (from
//      Vault). Same wire format as simone mode — only the upstream changes.
//
//   3. 'local' — direct WebSocket to a locally-running simone-bridge at
//      ws://127.0.0.1:8765 (configurable). Bridge spawns claude-code (or
//      codex) with full filesystem + MCP tool access; replies stream back
//      as `assistant_delta` events that we translate into the same
//      onChunk/onDone callback shape the HTTP path uses. Requires
//      `smbls claude` (or equivalent) running locally.
//
// Why route here instead of per-consumer:
//   - One mode preference, one transport switch, one place to add a fourth
//     mode later. Consumers just call sdk.ai.stream({…}, {onChunk,…}) and
//     stay agnostic.
//   - The simone extension, workspace AppAssistant, canvas freestyler, and
//     tickets' standup AI used to each maintain their own dispatch path.
//     Migrating them to sdk.ai removes ~5 forked transport implementations.
//
// Wire shape is preserved across all three modes:
//   stream(payload, { onChunk, onDone, onError }) → cancel()
//   completion(payload) → Promise<result>
//   meetAnalyze(payload) → Promise<result>
//
// Local-mode WebSocket protocol (see smbls/plugins/simone-bridge):
//   surface → bridge: { type:'hello', surface, capabilities }
//   surface → bridge: { type:'select_target', target:{ mode, model, cwd? } }
//   surface → bridge: { type:'user_message', text, context? }
//   bridge → surface: { type:'bridge_ready', sessionId, ... }
//   bridge → surface: { type:'assistant_delta', blockIndex, text }
//   bridge → surface: { type:'turn_complete', isError, durationMs }
//   bridge → surface: { type:'tool_use', toolUseId, tool, input }
// The bridge handles tool calls itself in app mode; we don't proxy tool
// results back from here (the surface that needs tool round-trips —
// canvas — connects directly to the bridge with its own ws client that
// understands canvas tools).

const STORAGE_KEY_MODE = 'symbols_ai_mode'
const STORAGE_KEY_BRIDGE_URL = 'symbols_ai_bridge_url'
const STORAGE_KEY_AUTH_MODE = 'symbols_ai_auth_mode'
const DEFAULT_MODE = 'simone'
const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:8765'
const DEFAULT_AUTH_MODE = 'ask'

// Intent contract — every prompt the user submits to sdk.ai.dispatch
// classifies into exactly one of these three intents. The classifier is
// LLM-side (system prompt declares three tools and the model picks one),
// with a single client-side hard hint: text starting with `/new` always
// goes to BUILD without a round-trip.
//
//   BUILD   — "make me a landing page", "/new dashboard with kanban"
//             → returns { intent:'build', spec } so the caller hands off
//               to the freestyler pipeline (canvas/functions/freestyleBridge
//               for in-canvas tile, or pages/add-app for full-page).
//
//   ANSWER  — "what time is the meeting?", "explain RLS"
//             → streams text via { onChunk, onDone } so the caller can
//               surface it in AppAssistant drawer or inline reply.
//
//   ACTION  — "create a ticket for the bug Imad mentioned", "move 2231 to In Review"
//             → returns { intent:'action', actions:[{ kind, params, sdkCall }] }
//               and the caller renders AiActionConfirmCard (ask mode) OR
//               executes immediately (auto mode) via sdk.execute(...).
//
// Action proposal shape — every entry in `actions` is self-describing:
//   { kind: 'ticket.create' | 'ticket.update' | 'ticket.move' |
//           'event.create' | 'note.create' | 'doc.create' | …,
//     params: { … },     // entity-specific
//     summary: 'string', // one-line human-readable summary for the card
//     sdkCall: {         // resolved-call descriptor — the confirm handler
//       service: 'tickets',     just does sdk[service].execute(method, args)
//       method: 'create',
//       args: [...]
//     }
//   }
export const INTENT_BUILD = 'build'
export const INTENT_ANSWER = 'answer'
export const INTENT_ACTION = 'action'

// Mode catalog — the dropdown UI reads this via sdk.ai.modes() to render
// the picker. `available` is a runtime check (e.g. local mode pings the
// bridge before declaring itself reachable). `disabledReason` is shown
// inline in the picker when a mode can't be used.
const MODE_CATALOG = [
  {
    key: 'simone',
    label: 'Symbols Cloud',
    description: 'Managed Anthropic + OpenAI keys via Symbols Service. Zero setup.',
    transport: 'http'
  },
  {
    key: 'providers',
    label: 'Org providers',
    description: 'Routes through @symbo.ls/ai-providers using your org\'s keys (Vault).',
    transport: 'http'
  },
  {
    key: 'local',
    label: 'Local agent',
    description: 'Direct WebSocket to simone-bridge (claude-code / codex). Requires local setup.',
    transport: 'ws'
  }
]

export class AiService extends BaseService {
  constructor (config) {
    super(config)
    // Live WebSocket for local mode. Lazily created on first stream call.
    // Kept open across turns so the bridge can preserve session state
    // (memory, tool context). Reset on disconnect / mode change.
    this._bridgeWs = null
    this._bridgeReady = null  // Promise<void> resolved when 'bridge_ready' arrives
    this._bridgeSessionId = null
    // Per-turn callback registry keyed by an internal turn id. The bridge
    // doesn't echo the user_message turn id back (yet), so we serialize:
    // one open turn at a time. Subsequent stream() calls queue.
    this._pendingTurn = null
    this._turnQueue = []
  }

  // ==================== MODE ====================

  getMode () {
    try {
      return localStorage.getItem(STORAGE_KEY_MODE) || DEFAULT_MODE
    } catch (_) {
      return DEFAULT_MODE
    }
  }

  setMode (mode) {
    if (!MODE_CATALOG.find((m) => m.key === mode)) {
      throw new Error(`[sdk.ai] unknown mode "${mode}". Valid: ${MODE_CATALOG.map((m) => m.key).join(', ')}`)
    }
    try { localStorage.setItem(STORAGE_KEY_MODE, mode) } catch (_) {}
    // Drop any open bridge WebSocket so the next stream() reconnects in
    // the right mode (e.g. simone → local should not reuse a dead ws).
    this._closeBridge('mode change')
  }

  // Returns the mode catalog augmented with runtime availability. The UI
  // picker uses this to grey-out modes that aren't reachable. The check
  // is best-effort — `simone`/`providers` are always available if the user
  // has an auth token; `local` requires the bridge to be reachable.
  async modes () {
    const current = this.getMode()
    return MODE_CATALOG.map((m) => ({
      ...m,
      active: m.key === current,
      // Runtime availability is async per-mode; expose a static `available: true`
      // default and let the picker call `localBridge.status()` lazily for `local`.
      available: m.key !== 'local' ? true : null
    }))
  }

  // ==================== AUTH MODE (ask / auto) ====================

  // Whether SDK actions proposed by the LLM (intent:'action') need user
  // confirmation before execution.
  //
  //   'ask'  (default) — sdk.ai.dispatch returns the proposed actions and
  //                      the UI shows AiActionConfirmCard with Confirm /
  //                      Reject buttons. SDK call fires on confirm.
  //   'auto'           — sdk.ai.dispatch executes the SDK calls itself and
  //                      returns the resolved results in `actions[i].result`.
  //                      No UI confirmation. Suited for power users +
  //                      sandboxed test runs; lets the AI act on the
  //                      workspace without an extra click.
  //
  // build + answer intents are unaffected — build always confirms via the
  // freestyler preview pane, and answer is read-only.
  getAuthMode () {
    try {
      return localStorage.getItem(STORAGE_KEY_AUTH_MODE) || DEFAULT_AUTH_MODE
    } catch (_) {
      return DEFAULT_AUTH_MODE
    }
  }

  setAuthMode (authMode) {
    if (authMode !== 'ask' && authMode !== 'auto') {
      throw new Error(`[sdk.ai] unknown authMode "${authMode}". Valid: 'ask', 'auto'`)
    }
    try { localStorage.setItem(STORAGE_KEY_AUTH_MODE, authMode) } catch (_) {}
  }

  // ==================== BRIDGE URL CONFIG ====================

  getBridgeUrl () {
    try {
      return localStorage.getItem(STORAGE_KEY_BRIDGE_URL) || DEFAULT_BRIDGE_URL
    } catch (_) {
      return DEFAULT_BRIDGE_URL
    }
  }

  setBridgeUrl (url) {
    try { localStorage.setItem(STORAGE_KEY_BRIDGE_URL, url) } catch (_) {}
    this._closeBridge('bridge url change')
  }

  // ==================== LOCAL BRIDGE STATUS ====================

  localBridge = {
    // Quick reachability ping — opens a transient WebSocket, waits for the
    // bridge_ready event with a 1.5s timeout, then closes. Used by the
    // picker UI to mark local mode as available / unreachable.
    status: () => new Promise((resolve) => {
      let resolved = false
      const finish = (ok, reason) => {
        if (resolved) return
        resolved = true
        try { ws.close() } catch (_) {}
        resolve({ available: ok, reason })
      }
      let ws
      try {
        ws = new WebSocket(this.getBridgeUrl())
      } catch (err) {
        return resolve({ available: false, reason: err.message })
      }
      const timer = setTimeout(() => finish(false, 'timeout'), 1500)
      ws.addEventListener('open', () => {
        try {
          ws.send(JSON.stringify({ type: 'hello', surface: 'sdk-probe', capabilities: [] }))
        } catch (_) {}
      })
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'bridge_ready') {
            clearTimeout(timer)
            finish(true, null)
          }
        } catch (_) {}
      })
      ws.addEventListener('error', () => { clearTimeout(timer); finish(false, 'error') })
      ws.addEventListener('close', () => { clearTimeout(timer); finish(false, 'closed') })
    })
  }

  // ==================== DISPATCH (intent-classified turn) ====================

  // Single entry point for every interactive AI surface (CanvasPromptTextarea,
  // AppAssistant, the simone extension). Classifies the prompt into BUILD /
  // ANSWER / ACTION and returns a normalized response shape the UI can
  // route on.
  //
  // payload:
  //   text:        the user's prompt
  //   context:     freeform JSON the caller surface adds (active route,
  //                selected ticket, calendar event, …)
  //   messages?:   optional prior turn history for multi-turn surfaces
  //   threadId?:   AppAssistant thread for persistence
  //
  // callbacks (for the streamed text portion of an ANSWER intent):
  //   onChunk(deltaText)
  //   onDone(result)              — also fired for build / action so the
  //                                 caller has a single completion hook
  //   onError(err)
  //
  // Returns: Promise<{
  //   intent: 'build' | 'answer' | 'action',
  //
  //   // ANSWER:
  //   text?: string,              // full assistant reply
  //
  //   // BUILD:
  //   spec?: { kind: 'page' | 'tile' | 'component', body: object },
  //                                hand off to freestyler (canvas) or
  //                                add-app (full-page) based on `kind`.
  //
  //   // ACTION:
  //   actions?: [ProposedAction],  // shape declared at top of file
  //   requiresConfirmation?: bool, // true when authMode === 'ask'
  //   results?: [...]              // populated when authMode === 'auto'
  // }>
  //
  // Wire: same /ai-chat/stream endpoint. The server reads `intentTools`
  // from the payload and runs the LLM with a tool-use system prompt that
  // declares three tools: build_app / answer / propose_actions. The model
  // calls exactly one and the server returns the structured response.
  //
  // Client-side hint: a prompt starting with `/new` (case-insensitive,
  // optional trailing space) is forced to BUILD without consulting the
  // LLM for classification — saves a round-trip on the most explicit case.
  // Everything else relies on LLM classification.
  async dispatch (payload = {}, callbacks = {}) {
    const text = String(payload.text || payload.content || '').trim()
    const forcedBuild = /^\/new(\s|$)/i.test(text)
    const authMode = this.getAuthMode()

    const requestBody = {
      payload: {
        ...payload,
        text,
        intentMode: forcedBuild ? 'build' : 'classify',
        authMode,
        mode: this.getMode()
      }
    }

    // ANSWER intent streams text; BUILD/ACTION return structured payloads
    // delivered through onDone. We forward both: onChunk fires when the
    // server emits assistant_delta events; onDone fires once with the
    // resolved intent + payload.
    return new Promise((resolve, reject) => {
      let buffered = ''
      let resolved = false
      this._streamPost('/ai-chat/dispatch', requestBody, {
        onChunk: (delta) => {
          buffered += delta
          callbacks.onChunk?.(delta)
        },
        onDone: async (payload) => {
          if (resolved) return
          resolved = true
          const result = payload && typeof payload === 'object'
            ? payload
            : { intent: INTENT_ANSWER, text: buffered }
          // Auto-execute proposed actions when authMode is 'auto'.
          if (result.intent === INTENT_ACTION && authMode === 'auto' && Array.isArray(result.actions)) {
            result.results = await this._executeActions(result.actions)
            result.requiresConfirmation = false
          } else if (result.intent === INTENT_ACTION) {
            result.requiresConfirmation = true
          }
          callbacks.onDone?.(result)
          resolve(result)
        },
        onError: (err) => {
          if (resolved) return
          resolved = true
          callbacks.onError?.(err)
          reject(err)
        }
      })
    })
  }

  // Execute a list of ProposedAction descriptors. Called by dispatch() in
  // authMode='auto' and by the AiActionConfirmCard's Confirm button in
  // authMode='ask'. Resolves each action via the SDK's service surface —
  // no domain knowledge in the AI service itself.
  //
  // Action descriptor shape:
  //   { sdkCall: { service:'tickets', method:'create', args:[{…}] } }
  //
  // Returns an array of { action, result?, error? } in input order.
  async _executeActions (actions) {
    const out = []
    for (const action of actions) {
      const call = action?.sdkCall
      if (!call?.service || !call?.method) {
        out.push({ action, error: new Error('[sdk.ai] action missing sdkCall.service/method') })
        continue
      }
      try {
        // BaseService keeps a reference to the parent SDK instance via
        // this._context.services or this._sdk. Resolve the target service
        // dynamically so the AI service stays decoupled from specific
        // service shapes.
        const sdk = this._context?.services || this._sdk
        const target = sdk?.[call.service]
        if (!target || typeof target[call.method] !== 'function') {
          throw new Error(`[sdk.ai] unknown action ${call.service}.${call.method}`)
        }
        const result = await target[call.method](...(call.args || []))
        out.push({ action, result })
      } catch (err) {
        out.push({ action, error: err })
      }
    }
    return out
  }

  // Public wrapper consumed by AiActionConfirmCard on Confirm click. Kept
  // public (vs the _executeActions internal) because the UI workflow is:
  //   1. dispatch() returns actions + requiresConfirmation
  //   2. UI shows AiActionConfirmCard
  //   3. user clicks Confirm → UI calls sdk.ai.executeActions(actions)
  executeActions (actions) {
    return this._executeActions(actions)
  }

  // ==================== STREAM ====================

  // Unified streaming turn. Signature matches AiChatService.stream so
  // consumers can swap by changing `sdk.aiChat.stream` to `sdk.ai.stream`.
  //
  // payload:
  //   { content, messages?, threadId?, attachedCard?, systemPromptOverride?,
  //     model?, context? }
  // callbacks:
  //   onChunk(deltaText), onDone({ text, usage, ... }), onError(err)
  // returns: cancel() — abort the in-flight turn
  stream (payload = {}, callbacks = {}) {
    const mode = this.getMode()
    if (mode === 'local') return this._streamLocal(payload, callbacks)
    // simone + providers share the HTTP/SSE path; the server reads `mode`
    // from the body to pick the upstream.
    return this._streamHttp(payload, callbacks, mode)
  }

  _streamHttp (payload, callbacks, mode) {
    const body = { payload: { ...payload, mode } }
    return this._streamPost('/ai-chat/stream', body, callbacks)
  }

  _streamLocal (payload, callbacks) {
    const { onChunk, onDone, onError } = callbacks
    let cancelled = false
    const turn = {
      cancel: () => { cancelled = true },
      onChunk,
      onDone,
      onError,
      buffer: ''
    }

    // Serialize turns — bridge sessions are single-turn-at-a-time. If
    // there's already an open turn, queue this one and start it when the
    // current finishes.
    const startTurn = async () => {
      if (cancelled) return
      try {
        await this._ensureBridge()
      } catch (err) {
        onError?.(err)
        return
      }
      if (cancelled) return
      this._pendingTurn = turn
      try {
        this._bridgeWs.send(JSON.stringify({
          type: 'user_message',
          text: payload.content || payload.text || '',
          context: payload.context || null
        }))
      } catch (err) {
        this._pendingTurn = null
        onError?.(err)
      }
    }

    if (this._pendingTurn) {
      this._turnQueue.push(startTurn)
    } else {
      startTurn()
    }

    return () => {
      cancelled = true
      if (this._pendingTurn === turn) this._pendingTurn = null
    }
  }

  // ==================== COMPLETION ====================

  // Non-streaming turn — collects the stream into a single promise.
  // Mirrors AiChatService.completion shape so consumers swap cleanly.
  //
  // For HTTP modes this could hit the dedicated /ai-chat/completion route,
  // but routing through stream() keeps the mode-switch logic in ONE place.
  completion (payload = {}) {
    return new Promise((resolve, reject) => {
      let buffer = ''
      let finalPayload = null
      this.stream(payload, {
        onChunk: (delta) => { buffer += delta },
        onDone: (payload) => {
          finalPayload = payload
          resolve(finalPayload || { text: buffer })
        },
        onError: (err) => reject(err)
      })
    })
  }

  // ==================== MEET ANALYZE ====================

  // Pass-through to the existing aiChat.meetAnalyze — meet transcripts use
  // a specialized server-side path that loads the room transcript and runs
  // a fixed-shape extraction prompt. No mode routing needed (the upstream
  // provider is server-side regardless), but exposing it under sdk.ai keeps
  // the consumer-facing namespace consistent.
  meetAnalyze (payload) {
    return this._call('ai.meetAnalyze', '/ai-chat/meet-analyze', {
      method: 'POST',
      body: { payload }
    })
  }

  // ==================== BRIDGE LIFECYCLE (private) ====================

  // Lazily open the WebSocket to simone-bridge and resolve once
  // 'bridge_ready' is received. Reused across turns; reconnects on close.
  async _ensureBridge () {
    if (this._bridgeWs && this._bridgeWs.readyState === WebSocket.OPEN && this._bridgeReady) {
      await this._bridgeReady
      return
    }
    if (this._bridgeWs) {
      try { this._bridgeWs.close() } catch (_) {}
    }
    const url = this.getBridgeUrl()
    this._bridgeWs = new WebSocket(url)
    this._bridgeWs.addEventListener('message', (ev) => this._onBridgeMessage(ev))
    this._bridgeWs.addEventListener('close', () => this._onBridgeClose())
    this._bridgeWs.addEventListener('error', (e) => this._onBridgeError(e))

    this._bridgeReady = new Promise((resolve, reject) => {
      const openTimer = setTimeout(() => reject(new Error('[sdk.ai.local] bridge open timeout')), 5000)
      this._bridgeWs.addEventListener('open', () => {
        try {
          this._bridgeWs.send(JSON.stringify({
            type: 'hello',
            surface: 'sdk',
            capabilities: []
          }))
          // Tell the bridge we want app mode (no canvas tools) — workspace
          // surfaces that need canvas-mcp tool routing connect directly
          // with their own client.
          this._bridgeWs.send(JSON.stringify({
            type: 'select_target',
            target: { mode: 'app' }
          }))
        } catch (err) {
          clearTimeout(openTimer)
          reject(err)
        }
      })
      this._bridgeWs.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'bridge_ready') {
            this._bridgeSessionId = msg.sessionId
            clearTimeout(openTimer)
            resolve()
          }
        } catch (_) {}
      })
    })

    await this._bridgeReady
  }

  _onBridgeMessage (ev) {
    let msg
    try { msg = JSON.parse(ev.data) } catch (_) { return }
    const turn = this._pendingTurn
    if (!turn) return  // unsolicited messages (heartbeats, etc.) ignored

    if (msg.type === 'assistant_delta') {
      turn.buffer += msg.text || ''
      turn.onChunk?.(msg.text || '')
    } else if (msg.type === 'turn_complete') {
      const final = { text: turn.buffer, durationMs: msg.durationMs }
      this._pendingTurn = null
      turn.onDone?.(final)
      this._drainQueue()
    } else if (msg.type === 'agent_stuck') {
      this._pendingTurn = null
      turn.onError?.(new Error(`[sdk.ai.local] agent stuck: ${msg.reason}`))
      this._drainQueue()
    }
    // tool_use: app mode shouldn't see tool calls (bridge handles them);
    // if one slips through, ignore — surfaces that proxy tools (canvas)
    // connect to the bridge with their own client.
  }

  _onBridgeClose () {
    this._bridgeWs = null
    this._bridgeReady = null
    if (this._pendingTurn) {
      this._pendingTurn.onError?.(new Error('[sdk.ai.local] bridge connection closed'))
      this._pendingTurn = null
    }
    this._turnQueue = []
  }

  _onBridgeError (e) {
    if (this._pendingTurn) {
      this._pendingTurn.onError?.(new Error('[sdk.ai.local] bridge socket error'))
      this._pendingTurn = null
    }
  }

  _drainQueue () {
    const next = this._turnQueue.shift()
    if (next) next()
  }

  _closeBridge (reason) {
    if (this._bridgeWs) {
      try { this._bridgeWs.close(1000, reason) } catch (_) {}
    }
    this._bridgeWs = null
    this._bridgeReady = null
    this._bridgeSessionId = null
    if (this._pendingTurn) {
      this._pendingTurn.onError?.(new Error(`[sdk.ai.local] ${reason}`))
      this._pendingTurn = null
    }
    this._turnQueue = []
  }
}

export const createAiService = (config) => new AiService(config)
