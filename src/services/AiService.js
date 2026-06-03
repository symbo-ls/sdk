import { BaseService } from './BaseService.js'

// AiService — single entry point for every UI surface that talks to an
// LLM (AppAssistant, CanvasPromptTextarea, ticket standup/detail editor,
// meet transcript analysis, the simone extension, …).
//
// Transport: a WORKSPACE-scoped agent conversation served over SSE. Every
// interactive turn opens a per-workspace conversation (cached in
// localStorage) and streams the assistant's reply back as
// `event: <name>\ndata: <json>\n\n` frames:
//
//   base = `${apiUrl}/core/agents/workspaces/${workspaceId}/conversations`  (default)
//   base = `${apiUrl}/core/agents/projects/${projectId}/conversations`      (when scoped)
//   POST base                      { title? }  → { success, data:{ id } }
//   POST base/:id/messages         { content, modelMode }
//                                  → { success, data:{ conversation, userMessage, assistantMessage } }
//   GET  base/:id/stream           → SSE frames:
//        event: conversation.snapshot  data { conversation, messages:[…] }
//        event: message.created        data { id, role, content:[{type:'text',text}], … }
//        event: message.delta          data { message:'<delta>' }   (may not be emitted yet)
//        event: conversation.heartbeat data { … }
//
// Why route here instead of per-consumer:
//   - One transport, one place to add capabilities later. Consumers just
//     call sdk.ai.stream({…}, {onChunk,…}) and stay agnostic.
//   - The simone extension, workspace AppAssistant, canvas freestyler, and
//     tickets' standup AI used to each maintain their own dispatch path.
//     Migrating them to sdk.ai removes ~5 forked transport implementations.
//
// Wire shape consumers depend on (preserved):
//   stream(payload, { onChunk, onDone, onError }) → cancel()
//   dispatch(payload, callbacks) → Promise<{ intent, text? | spec? }>
//   completion(payload) → Promise<result>
//   meetAnalyze(payload) → Promise<result>

const STORAGE_KEY_MODEL_MODE = 'symbols_ai_model_mode'
const STORAGE_KEY_AUTH_MODE = 'symbols_ai_auth_mode'
const DEFAULT_MODEL_MODE = 'auto'
const DEFAULT_AUTH_MODE = 'ask'

// Model-mode catalog — the upstream provider routing the workspace agent
// should use for a turn. Persisted in localStorage and sent as `modelMode`
// on every appended message.
const MODEL_MODES = ['auto', 'openai', 'openrouter', 'anthropic', 'gemini', 'research', 'cheap']

// How long to wait after the message POST resolves before falling back to
// a one-shot getConversation() read — the server publishes message.created
// synchronously during the POST, so the SSE frame normally beats this.
const ASSISTANT_FALLBACK_MS = 1000

// Intent contract — every prompt the user submits to sdk.ai.dispatch
// classifies into exactly one of these three intents. The workspace agent
// transport is answer-only, so dispatch resolves ANSWER for everything
// except the one client-side hard hint: text starting with `/new` always
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

export class AiService extends BaseService {
  // ==================== MODEL MODE ====================

  // Which upstream provider the workspace agent routes a turn through.
  // Persisted in localStorage and sent as `modelMode` on every message.
  getModelMode () {
    try {
      return localStorage.getItem(STORAGE_KEY_MODEL_MODE) || DEFAULT_MODEL_MODE
    } catch (_) {
      return DEFAULT_MODEL_MODE
    }
  }

  setModelMode (mode) {
    if (!MODEL_MODES.includes(mode)) {
      throw new Error(`[sdk.ai] unknown modelMode "${mode}". Valid: ${MODEL_MODES.join(', ')}`)
    }
    try { localStorage.setItem(STORAGE_KEY_MODEL_MODE, mode) } catch (_) {}
  }

  // The picker UI reads this via sdk.ai.modes() to render the model-mode
  // dropdown. Returns [{ key, label }] with the active mode flagged.
  modes () {
    const current = this.getModelMode()
    return MODEL_MODES.map((key) => ({
      key,
      label: key === 'auto' ? 'Auto' : key.charAt(0).toUpperCase() + key.slice(1),
      active: key === current
    }))
  }

  // ==================== MODE (deprecated shims) ====================

  // Provider/transport mode-switching is gone — every turn flows through
  // the workspace agent. These shims stay so any straggler consumer that
  // still calls setMode/getMode keeps working without throwing.
  getMode () {
    return 'workspace'
  }

  setMode () {
    console.warn('[sdk.ai] setMode is deprecated; use setModelMode')
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

  // ==================== DISPATCH (intent-classified turn) ====================

  // Single entry point for every interactive AI surface (CanvasPromptTextarea,
  // AppAssistant, the simone extension). Classifies the prompt into BUILD /
  // ANSWER and returns a normalized response shape the UI can route on.
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
  //   onDone(result)              — also fired for build so the caller has a
  //                                 single completion hook
  //   onError(err)
  //
  // Returns: Promise<{
  //   intent: 'build' | 'answer',
  //   text?: string,              // ANSWER: full assistant reply
  //   spec?: { kind, body }       // BUILD: hand off to freestyler / add-app
  // }>
  //
  // Client-side hint: a prompt starting with `/new` (case-insensitive,
  // optional trailing space) is forced to BUILD without consulting the
  // agent — saves a round-trip on the most explicit case. Everything else
  // streams an answer from the workspace agent. The agent transport is
  // answer-only today, so ACTION proposals don't come back from here;
  // authMode is still read for forward-compat but currently unused.
  async dispatch (payload = {}, callbacks = {}) {
    const text = String(payload.text || payload.content || '').trim()
    const forcedBuild = /^\/new(\s|$)/i.test(text)

    // /new prefix is a hard hint — skip the round-trip and return the
    // build descriptor immediately so the caller can hand off to the
    // freestyler. Strips the prefix from the text before passing to the
    // builder so the LLM doesn't see it as part of the spec.
    if (forcedBuild) {
      const spec = { kind: 'page', body: text.replace(/^\/new\s*/i, '') }
      const result = { intent: INTENT_BUILD, spec }
      callbacks.onDone?.(result)
      return result
    }

    // Everything else is an ANSWER streamed from the workspace agent. We
    // buffer the streamed text and resolve once the turn completes.
    return new Promise((resolve) => {
      let buffered = ''
      this._streamWorkspaceTurn({ ...payload, content: text || payload.content, text }, {
        onChunk: (delta) => {
          buffered += delta
          callbacks.onChunk?.(delta)
        },
        onDone: (donePayload) => {
          const result = { intent: INTENT_ANSWER, text: donePayload?.text || buffered }
          callbacks.onDone?.(result)
          resolve(result)
        },
        onError: (err) => {
          callbacks.onError?.(err)
          resolve({ intent: INTENT_ANSWER, text: buffered, error: err?.message || String(err) })
        }
      })
    })
  }

  // Execute a list of ProposedAction descriptors. Called by the
  // AiActionConfirmCard's Confirm button. Resolves each action via the
  // SDK's service surface — no domain knowledge in the AI service itself.
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
  //   onChunk(deltaText), onDone({ text, … }), onError(err)
  // returns: cancel() — abort the in-flight turn
  stream (payload = {}, callbacks = {}) {
    return this._streamHttp(payload, callbacks)
  }

  _streamHttp (payload, callbacks) {
    return this._streamWorkspaceTurn(payload, callbacks)
  }

  // ==================== WORKSPACE AGENT TURN (private) ====================

  // Stream one turn through the workspace-scoped agent conversation.
  //
  //   1. Resolve the active workspace; bail via onError if none.
  //   2. Resolve (or lazily create + cache) the conversation id for it.
  //   3. Open the SSE stream BEFORE posting the message — the server runs
  //      the planner synchronously during the POST and publishes
  //      message.created, so we must be subscribed first to catch it.
  //   4. POST the message ({ content, modelMode }).
  //   5. If no assistant frame arrives within ASSISTANT_FALLBACK_MS of the
  //      POST resolving, fall back to a one-shot getConversation() read and
  //      surface the latest assistant message.
  //
  // Returns cancel() — aborts the SSE stream and marks the turn cancelled.
  _streamWorkspaceTurn (payload, callbacks = {}) {
    const { onChunk, onDone, onError } = callbacks

    // Scope: workspace is the DEFAULT ("most common"); a project-scoped
    // conversation is used when a projectId is supplied — agents work on both.
    // Both hit /core/agents/<scope>/conversations (note the /core prefix —
    // _requestExternal/_streamSSE take a full URL, so we add it here).
    const projectId = payload?.projectId || this._context?.activeProjectId
    let base, cacheKey
    if (projectId) {
      base = `${this._apiUrl}/core/agents/projects/${encodeURIComponent(projectId)}/conversations`
      cacheKey = `symbols_ai_conversation_project_${projectId}`
    } else {
      const wsId = this._context?.activeWorkspaceId || this._readActiveWorkspace()
      if (!wsId) {
        onError?.(new Error('[sdk.ai] no active workspace or project selected'))
        return () => {}
      }
      base = `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/conversations`
      cacheKey = `symbols_ai_conversation_${wsId}`
    }

    let answered = false
    let cancelled = false
    let cancelStream = () => {}
    let fallbackTimer = null

    const stopStream = () => { try { cancelStream() } catch (_) {} }
    const clearFallback = () => {
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
    }

    // Pull the joined text out of an assistant message's content blocks.
    const blocksToText = (content) =>
      (content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('')

    const finishAnswer = (txt) => {
      if (answered || cancelled) return
      answered = true
      clearFallback()
      onChunk?.(txt)
      onDone?.({ text: txt })
      stopStream()
    }

    const fail = (err) => {
      if (answered || cancelled) return
      answered = true
      clearFallback()
      onError?.(err)
      stopStream()
    }

    ;(async () => {
      let conversationId
      try {
        conversationId = await this._resolveConversationId(cacheKey, base)
      } catch (err) {
        fail(err)
        return
      }
      if (cancelled) return

      // Subscribe FIRST so we don't miss the synchronously-published
      // message.created frame, then POST the message.
      cancelStream = this._streamSSE(`${base}/${conversationId}/stream`, {
        onEvent: ({ event, data }) => {
          if (answered || cancelled) return
          if (event === 'message.delta' && data?.message) {
            onChunk?.(data.message)
            return
          }
          if (event === 'message.created' && data?.role === 'assistant') {
            finishAnswer(blocksToText(data.content))
          }
        },
        onError: (err) => fail(err)
      })

      // POST the user message. The assistant reply comes back over the SSE
      // stream above (message.created), not in this response.
      this._requestExternal(`${base}/${conversationId}/messages`, {
        method: 'POST',
        body: {
          content: payload.content || payload.text || '',
          modelMode: this.getModelMode(),
          targetAgentId: (payload && (payload.targetAgentId || (payload.context && payload.context.targetAgentId))) || null
        },
        methodName: 'ai.appendMessage'
      }).then(() => {
        if (answered || cancelled) return
        // Race guard: if the assistant frame hasn't arrived shortly after
        // the POST resolves, read the conversation directly and use the
        // latest assistant message.
        clearFallback()
        fallbackTimer = setTimeout(() => {
          this._fallbackToLatestAssistant(base, conversationId, finishAnswer, fail)
        }, ASSISTANT_FALLBACK_MS)
      }).catch((err) => fail(err))
    })()

    return () => {
      cancelled = true
      clearFallback()
      stopStream()
    }
  }

  // Resolve the conversation id for a workspace, creating + caching one on
  // first use. Cached per-workspace in localStorage so a surface reopened
  // later resumes the same conversation.
  async _resolveConversationId (cacheKey, base) {
    const cached = this._readStorage(cacheKey)
    if (cached) return cached

    const res = await this._requestExternal(base, {
      method: 'POST',
      body: {},
      methodName: 'ai.createConversation'
    })
    // _requestExternal returns the raw body — unwrap the { success, data }
    // envelope when present, else accept a bare conversation object.
    const data = res && typeof res === 'object' && 'data' in res ? res.data : res
    const id = data?.id
    if (!id) throw new Error('[sdk.ai] createConversation returned no id')
    this._writeStorage(cacheKey, id)
    return id
  }

  // One-shot read of the conversation, surfacing the latest assistant
  // message's text. Fallback for when no streamed assistant frame arrived.
  async _fallbackToLatestAssistant (base, conversationId, finishAnswer, fail) {
    try {
      const res = await this._requestExternal(`${base}/${conversationId}`, {
        method: 'GET',
        methodName: 'ai.getConversation'
      })
      const data = res && typeof res === 'object' && 'data' in res ? res.data : res
      const messages = data?.messages || []
      const assistant = [...messages].reverse().find((m) => m?.role === 'assistant')
      const txt = assistant
        ? (assistant.content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('')
        : ''
      if (txt) finishAnswer(txt)
      else fail(new Error('[sdk.ai] no assistant response'))
    } catch (err) {
      fail(err)
    }
  }

  // ==================== CONVERSATIONS (thread history) ====================
  // Per-member workspace conversation history (server: WorkspaceMemberConversation).
  // Default scope is the active workspace; pass { projectId } for a project thread.
  // Used by simone's Sessions ▾ thread selector.

  // Base URL for the active scope (project when in scope, else active workspace).
  _conversationBase (opts = {}) {
    const projectId = opts?.projectId || this._context?.activeProjectId
    if (projectId) {
      return `${this._apiUrl}/core/agents/projects/${encodeURIComponent(projectId)}/conversations`
    }
    const wsId = this._context?.activeWorkspaceId || this._readActiveWorkspace()
    if (!wsId) throw new Error('[sdk.ai] no active workspace or project selected')
    return `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/conversations`
  }

  _unwrap (res) {
    return res && typeof res === 'object' && 'data' in res ? res.data : res
  }

  // Thread list for the active scope → [{ id, conversationId, title,
  // lastMessageAt, pinned, unread }].
  async listConversations (opts = {}) {
    const res = await this._requestExternal(this._conversationBase(opts), {
      method: 'GET',
      methodName: 'ai.listConversations'
    })
    return this._unwrap(res) || []
  }

  // Load one thread → { conversation, messages }. Side effect: marks read.
  async getConversation (conversationId, opts = {}) {
    const res = await this._requestExternal(
      `${this._conversationBase(opts)}/${encodeURIComponent(conversationId)}`,
      { method: 'GET', methodName: 'ai.getConversation' }
    )
    return this._unwrap(res)
  }

  // Create a fresh thread. Returns the conversation summary ({ id, ... }).
  async createConversation (opts = {}) {
    const targetAgentId = (opts && (opts.targetAgentId || (opts.context && opts.context.targetAgentId))) || null
    const res = await this._requestExternal(this._conversationBase(opts), {
      method: 'POST',
      body: { title: opts.title, ...(targetAgentId ? { targetAgentId } : {}) },
      methodName: 'ai.createConversation'
    })
    return this._unwrap(res)
  }

  // Pin / archive / rename a thread for the current member.
  async patchConversation (conversationId, patch = {}, opts = {}) {
    const res = await this._requestExternal(
      `${this._conversationBase(opts)}/${encodeURIComponent(conversationId)}`,
      { method: 'PATCH', body: patch, methodName: 'ai.patchConversation' }
    )
    return this._unwrap(res)
  }

  // Soft-archive a thread for the current member (keeps the conversation).
  async deleteConversation (conversationId, opts = {}) {
    await this._requestExternal(
      `${this._conversationBase(opts)}/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE', methodName: 'ai.deleteConversation' }
    )
    return true
  }

  // ==================== COMPLETION ====================

  // Non-streaming turn — collects the stream into a single promise.
  // Mirrors AiChatService.completion shape so consumers swap cleanly.
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

  // ==================== STORAGE HELPERS (private) ====================

  _readActiveWorkspace () {
    return this._readStorage('activeWorkspace')
  }

  _readStorage (key) {
    try { return localStorage.getItem(key) } catch (_) { return null }
  }

  _writeStorage (key, value) {
    try { localStorage.setItem(key, value) } catch (_) {}
  }
}

export const createAiService = (config) => new AiService(config)
