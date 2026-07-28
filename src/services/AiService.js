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
  //   intent: 'build' | 'answer' | 'action',
  //   text?: string,                          // ANSWER: full assistant reply
  //   spec?: { name, source } | { pages, components }  // BUILD: renderable DOMQL
  // }>
  //
  // Build gating: a prompt is a BUILD turn when it starts with `/new`
  // (case-insensitive, optional trailing space) OR the caller passes
  // `{ build: true }` explicitly. BUILD turns route to the server's
  // intent-classified `/ai-chat/dispatch` endpoint (AiChatDispatchController),
  // which runs a code-generation pass and returns a renderable
  // `{ intent:'build', spec }` — a single `{ name, source }` or a multi-page
  // `{ pages, components }`. The spec is returned to the caller AS-IS so the
  // canvas split-view / add-app builder can paint real DOMQL.
  //
  // Everything else (ANSWER / ACTION — the shared chat backbone) takes the
  // UNCHANGED workspace-agent streaming path below. authMode is still read for
  // forward-compat but currently unused.
  async dispatch (payload = {}, callbacks = {}) {
    const text = String(payload.text || payload.content || '').trim()
    const forcedBuild = /^\/new(\s|$)/i.test(text) || payload.build === true

    // BUILD turn — hit the server build endpoint and pass its { intent, spec }
    // through untouched. Strip a leading `/new` so the generator sees the bare
    // description, not the routing prefix.
    if (forcedBuild) {
      const description = text.replace(/^\/new\s*/i, '')
      return this._dispatchBuild({ ...payload, text: description, content: description }, callbacks)
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
          const result = {
            intent: INTENT_ANSWER,
            text: donePayload?.text || buffered,
            conversationId: donePayload?.conversationId || null,
            // Server assistant-message id — the transport re-keys its
            // optimistic message into the server id-space with this.
            messageId: donePayload?.messageId || null,
            // Follow-up suggestions (server-validated) — rendered as
            // tappable pills under the reply.
            suggestions: Array.isArray(donePayload?.suggestions) ? donePayload.suggestions : []
          }
          callbacks.onDone?.(result)
          resolve(result)
        },
        onError: (err) => {
          callbacks.onError?.(err)
          resolve({ intent: INTENT_ANSWER, text: buffered, error: err?.message || String(err) })
        },
        // Browser-run platform actions (navigate / theme / search / confirm).
        // The consumer resolves (callId, tool, args) → result; the SDK submits
        // it to resume the loop. Without a handler, the server gets an error
        // result and the model adapts.
        onToolCall: callbacks.onToolCall,
        // Structured tool-activity frames ({ phase:'started'|'completed',
        // callId, tool, args?, ok?, summary? }) for EVERY tool the loop runs —
        // the consumer renders these as the live agentic timeline instead of
        // any tool traffic ever appearing as message text.
        onToolEvent: callbacks.onToolEvent,
        // Live active-process events (delegated/chained sub-agents starting +
        // finishing) — informational; the consumer renders the process panel +
        // canvas activity from these.
        onProcessActive: callbacks.onProcessActive
      })
    })
  }

  // BUILD-only transport. POSTs the prompt to the server's intent-classified
  // `/ai-chat/dispatch` SSE endpoint (AiChatDispatchController), which runs a
  // DOMQL code-generation pass and returns the FINAL `{ done:true, intent,
  // spec, ... }` frame. We pass the server's `{ intent, spec }` through
  // VERBATIM — no flattening to `intent:'answer'`, no dropping `spec` — so the
  // canvas split-view / add-app builder receives the renderable spec
  // (`{ name, source }` or `{ pages, components }`).
  //
  // Wire shape — matches AiChatDispatchController.writeEvent: plain `data:`
  // JSON frames, NO `event:` line, terminated by `data: [DONE]`:
  //   data: { "done": true, "intent": "build", "spec": {…} }   ← final
  //   data: [DONE]                                              ← terminator
  //   data: { "error": "…" }                                   ← failure
  // `_streamPost` already decodes exactly this: `parsed.done` → onDone,
  // `parsed.error` → onError, `parsed.text` → onChunk (the endpoint emits no
  // text chunks today, but wiring onChunk keeps a future progress stream
  // working without another SDK change). `: ping` comments are skipped.
  //
  // Resilience: a transport/HTTP error, an error frame, or a synchronous throw
  // resolves to a build result with NO spec + an `error` field — the caller
  // (aiGeneratePages Phase-4 error handling) clears its loader and leaves the
  // overlay empty rather than throwing. This Promise NEVER rejects.
  _dispatchBuild (payload, callbacks = {}) {
    const { onChunk, onDone, onError } = callbacks
    return new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      try {
        this._streamPost('/ai-chat/dispatch', {
          text: payload.text || payload.content || '',
          mode: 'simone',
          authMode: this.getAuthMode(),
          model: payload.model || null,
          projectId: payload.projectId || (payload.context && payload.context.projectId) || null,
          context: payload.context || null
        }, {
          onChunk: (delta) => { onChunk?.(delta) },
          onDone: (donePayload) => {
            // Pass the server envelope through as-is. Default the intent to
            // build (this path is only entered for build turns) but DO NOT
            // synthesize or drop the spec.
            const result = {
              intent: donePayload?.intent || INTENT_BUILD,
              spec: donePayload?.spec,
              ...(donePayload?.text ? { text: donePayload.text } : {}),
              ...(donePayload?.actions ? { actions: donePayload.actions } : {})
            }
            onDone?.(result)
            finish(result)
          },
          onError: (err) => {
            onError?.(err)
            // Degrade gracefully — a build with no spec; the caller clears
            // loading and leaves the overlay empty.
            finish({ intent: INTENT_BUILD, spec: null, error: err?.message || String(err) })
          }
        })
      } catch (err) {
        // Synchronous throw out of _streamPost (e.g. service not ready) —
        // surface to onError and degrade to a spec-less build. Never reject.
        onError?.(err)
        finish({ intent: INTENT_BUILD, spec: null, error: err?.message || String(err) })
      }
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
    const { onChunk, onDone, onError, onToolCall, onToolEvent, onProcessActive } = callbacks

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
    let resolvedConvId = null
    let streamedAny = false
    let clientToolPending = false
    let cancelStream = () => {}
    let fallbackTimer = null
    // Client tools handled this turn — the same call can arrive over BOTH the
    // SSE frame (fast-path) and a POST response (reliable path); run it once.
    const handledCalls = new Set()

    const stopStream = () => { try { cancelStream() } catch (_) {} }
    const clearFallback = () => {
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
    }

    // Pull the joined text out of an assistant message's content blocks.
    const blocksToText = (content) =>
      (content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('')

    const finishAnswer = (txt, messageId, suggestions) => {
      if (answered || cancelled) return
      answered = true
      clearFallback()
      // If text deltas already streamed in, the chunks are already applied —
      // re-emitting the full text here would double it. Just finalize.
      if (!streamedAny) onChunk?.(txt)
      // Surface the conversation id this turn used so the caller can track the
      // active thread (esp. a NEW thread whose id was lazily created here), plus
      // the SERVER assistant message id so the caller can re-key its optimistic
      // message into the server id-space — without that, the live buffer (synthetic
      // a-… ids) and reloaded history (Mongo _ids) never reconcile and messages
      // duplicate or vanish on the next thread switch/reload.
      // `suggestions` = the server-validated follow-up actions from the
      // assistant message's metadata (buttons the surface renders under the
      // reply); [] when the answer carries none.
      onDone?.({
        text: txt,
        conversationId: resolvedConvId,
        messageId: messageId || null,
        suggestions: Array.isArray(suggestions) ? suggestions : []
      })
      stopStream()
    }

    // Pull the follow-up suggestions off a serialized assistant message.
    const messageSuggestions = (msg) => {
      const list = msg && msg.metadata && msg.metadata.suggestions
      return Array.isArray(list) ? list : []
    }

    const fail = (err) => {
      if (answered || cancelled) return
      answered = true
      clearFallback()
      onError?.(err)
      stopStream()
    }

    // Run one client (browser) tool and submit its outcome to resume the loop.
    // Reached from the SSE `tool.call_required` frame AND from suspended POST
    // responses — the latter is the reliable path: a proxied/idle stream can
    // die between suspensions, and a chained client tool whose frame is lost
    // used to strand the turn (observed: ask_user confirm → follow-on
    // aiDeleteTicket never delivered). The resume response likewise carries
    // either the NEXT suspension (chain again) or the final answer (finish).
    const runClientTool = (call) => {
      const id = String(call?.callId || '')
      if (!id || handledCalls.has(id) || answered || cancelled) return
      handledCalls.add(id)
      clientToolPending = true
      clearFallback()
      Promise.resolve(
        onToolCall
          ? onToolCall(id, call.tool, call.args, call)
          : { ok: false, error: 'No client-tool handler registered for this surface.' }
      )
        .then((result) =>
          this.submitToolResult(resolvedConvId, id, result === undefined ? { ok: true } : result, {
            projectId: payload?.projectId
          })
        )
        .catch((err) =>
          this.submitToolResult(resolvedConvId, id, { ok: false, error: String(err?.message || err) }, {
            projectId: payload?.projectId
          })
        )
        .then((resume) => {
          if (!resume) return
          if (resume.suspended) {
            if (resume.fn && resume.callId) runClientTool(resume)
            return
          }
          const txt = blocksToText(resume.assistantMessage?.content)
          if (txt) {
            finishAnswer(
              txt,
              resume.assistantMessage?._id || resume.assistantMessage?.id || null,
              messageSuggestions(resume.assistantMessage)
            )
          }
        })
        .catch(() => { /* resume-response consumption is best-effort */ })
        .finally(() => { clientToolPending = false })
    }

    ;(async () => {
      let conversationId
      try {
        // Honor the caller's active thread: if a real conversation id is passed
        // (from the session UI's activeSessionId), append to THAT thread —
        // otherwise fall back to the per-workspace cached/lazily-created one.
        // This is what makes "new thread" and "switch thread" actually route the
        // message to the selected conversation instead of one sticky cache id.
        const wanted = payload && payload.conversationId
        conversationId =
          wanted && !String(wanted).startsWith('s-')
            ? String(wanted)
            : await this._resolveConversationId(cacheKey, base, {
              // The caller explicitly opened a NEW thread (payload.newConversation,
              // set by the workspace transport when the active session is a local
              // 's-…' placeholder) — create a fresh server conversation instead of
              // resuming the cached one.
              forceNew: !!(payload && payload.newConversation)
            })
        resolvedConvId = conversationId
        // Keep the per-(workspace|project) cache tracking the LAST-USED thread,
        // not the first-ever one. _resolveConversationId only writes the cache when
        // it CREATES a conversation, so once a real id is passed (the session UI's
        // activeSessionId) the cache stayed pinned to the first conversation —
        // meaning any later turn arriving with a blank/local id fell back to that
        // first thread and independent threads collapsed onto it (the "messages
        // mixed up" bug). Write through so the cache always names the active thread.
        try { this._writeStorage(cacheKey, conversationId) } catch (_) {}
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
            streamedAny = true
            onChunk?.(data.message)
            return
          }
          // Client (browser) tool fast-path — the reliable path is the POST
          // responses (see runClientTool); dedupe by callId.
          if (event === 'tool.call_required' && data?.callId) {
            runClientTool(data)
            return
          }
          // Structured tool-activity frames — the loop opened ('started') or
          // closed ('completed') a tool row. PURELY INFORMATIONAL like the
          // process events; the consumer renders the live agentic timeline
          // from these (never from message text).
          if (event === 'tool.activity') {
            onToolEvent?.(data || {})
            return
          }
          // Active-process events: a delegated/chained sub-agent started or
          // finished. PURELY INFORMATIONAL — they do NOT end or suspend the turn
          // (no finishAnswer, no fallback-timer touch), so the final assistant
          // answer still resolves normally. The consumer renders them as a live
          // "who's working on what" panel + lights up the canvas.
          if (event === 'agent.started' || event === 'agent.completed') {
            onProcessActive?.({ event, ...(data || {}) })
            return
          }
          if (event === 'message.created' && data?.role === 'assistant') {
            // A multi-step agentic turn persists intermediate assistant
            // `tool_call` messages (tool_call part only, NO text) before the
            // final answer — finishing on the first assistant frame would end
            // the turn on an empty message. Only the final, text-bearing
            // assistant message ends the turn.
            const txt = blocksToText(data.content)
            if (txt) finishAnswer(txt, data.id || data._id || null, messageSuggestions(data))
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
          targetAgentId: (payload && (payload.targetAgentId || (payload.context && payload.context.targetAgentId))) || null,
          // Forward the caller's freeform per-turn context (page awareness:
          // currentPage / pageData / pageActions) so the server can surface it
          // in the agent's system instruction. Null when the caller passes none.
          context: (payload && payload.context) || null
        },
        methodName: 'ai.appendMessage'
      }).then((res) => {
        if (answered || cancelled) return
        // The POST response is the RELIABLE turn outcome: it carries either a
        // client-tool suspension (run it here — the SSE frame is a fast-path
        // that dies with the stream) or the final assistant message.
        const outcome = this._unwrap(res)
        if (outcome && outcome.suspended && outcome.fn && outcome.callId) {
          runClientTool(outcome)
          return
        }
        const finalTxt = blocksToText(outcome?.assistantMessage?.content)
        if (finalTxt) {
          finishAnswer(
            finalTxt,
            outcome?.assistantMessage?._id || outcome?.assistantMessage?.id || null,
            messageSuggestions(outcome?.assistantMessage)
          )
          return
        }
        // Race guard: if the assistant frame hasn't arrived shortly after
        // the POST resolves, read the conversation directly and use the
        // latest assistant message.
        clearFallback()
        if (clientToolPending) return
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
  // later resumes the same conversation. `forceNew` skips the cache READ and
  // creates a fresh conversation (still write-through cached): the "new
  // thread" path — a local placeholder session has no server id yet, and
  // falling back to the cached id silently appended the "new" thread's
  // messages (and their full model context) onto the previous conversation.
  async _resolveConversationId (cacheKey, base, { forceNew = false } = {}) {
    const cached = forceNew ? null : this._readStorage(cacheKey)
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
      // Find the latest assistant message that actually carries text — skip
      // intermediate `tool_call` assistant messages (no text part) from a
      // multi-step agentic turn.
      const textOf = (m) =>
        (m?.content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('')
      const assistant = [...messages].reverse().find((m) => m?.role === 'assistant' && textOf(m))
      const txt = assistant ? textOf(assistant) : ''
      const sg = assistant && assistant.metadata && Array.isArray(assistant.metadata.suggestions)
        ? assistant.metadata.suggestions
        : []
      if (txt) finishAnswer(txt, (assistant && (assistant.id || assistant._id)) || null, sg)
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

  // List the active workspace's AI-built extensions (Project{metadata.extension})
  // with their DOMQL source → [{ id, name, key, route, source, updatedAt }].
  // Powers the /add-app sidebar: created extensions appear and survive reload
  // (clicking re-renders the persisted source into the pane).
  async listExtensions (opts = {}) {
    const wsId = opts?.workspaceId || this._context?.activeWorkspaceId || this._readActiveWorkspace()
    if (!wsId) return []
    const res = await this._requestExternal(
      `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/extensions`,
      { method: 'GET', methodName: 'ai.listExtensions' }
    )
    return this._unwrap(res) || []
  }

  // Persist a NEW extension from a client Save (no agent turn) — the /add-app
  // Save button and the drawn-view "Save as app" affordance. body:
  // { workspaceId?, name, source, scope?:'private'|'shared' }. Returns the
  // created { projectId, key, name, route }. The saved extension appears in
  // listExtensions (→ the /add-app sidebar) and survives reload.
  async createExtension (body = {}) {
    const wsId = body?.workspaceId || this._context?.activeWorkspaceId || this._readActiveWorkspace()
    if (!wsId) throw new Error('[sdk.ai] no active workspace for createExtension')
    const res = await this._requestExternal(
      `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/extensions`,
      {
        method: 'POST',
        body: { name: body.name, source: body.source, scope: body.scope },
        methodName: 'ai.createExtension'
      }
    )
    return this._unwrap(res)
  }

  // Re-save an existing extension's source and/or scope. body:
  // { workspaceId?, source?, scope? }. Owner/admin only (server-enforced).
  async updateExtension (projectId, body = {}) {
    const wsId = body?.workspaceId || this._context?.activeWorkspaceId || this._readActiveWorkspace()
    if (!wsId) throw new Error('[sdk.ai] no active workspace for updateExtension')
    if (!projectId) throw new Error('[sdk.ai] projectId required for updateExtension')
    const res = await this._requestExternal(
      `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/extensions/${encodeURIComponent(projectId)}`,
      {
        method: 'PATCH',
        body: { source: body.source, scope: body.scope },
        methodName: 'ai.updateExtension'
      }
    )
    return this._unwrap(res)
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

  // Resume a turn that paused on a client (browser) tool: POST the outcome of
  // the el.call platform action so the server-side agentic loop continues.
  // `callId` is the id carried by the `tool.call_required` SSE event. Normally
  // invoked automatically by the streaming layer's onToolCall plumbing; exposed
  // for callers that drive the round-trip themselves. Returns the server's
  // { suspended, callId?, assistantMessage? } envelope.
  async submitToolResult (conversationId, callId, result, opts = {}) {
    const res = await this._requestExternal(
      `${this._conversationBase(opts)}/${encodeURIComponent(conversationId)}/tool-result`,
      {
        method: 'POST',
        body: { callId, result, ...(opts?.modelMode ? { modelMode: opts.modelMode } : {}) },
        methodName: 'ai.submitToolResult'
      }
    )
    return this._unwrap(res)
  }

  // Create a fresh thread. Returns the conversation summary ({ id, ... }).
  // Ephemeral one-shot turn — the conversations pipeline (router → simone
  // provider lead) with ZERO persistence: no conversation row, no messages.
  // The default for stateless consumers (ticket standups, inline
  // completions). payload: { content } or { messages:[{role,content}] },
  // optional system + modelMode.
  async turn (payload = {}, opts = {}) {
    // Workspace-scoped only — the /turn route lives on the workspace, so an
    // active project context must not divert the URL to /projects/:id.
    const wsId = opts?.workspaceId || this._context?.activeWorkspaceId || this._readActiveWorkspace()
    if (!wsId) throw new Error('[sdk.ai] no active workspace selected')
    const url = `${this._apiUrl}/core/agents/workspaces/${encodeURIComponent(wsId)}/turn`
    const body = {
      ...(Array.isArray(payload.messages) && payload.messages.length
        ? { messages: payload.messages }
        : { content: String(payload.content || payload.text || '') }),
      ...(payload.system ? { system: payload.system } : {}),
      modelMode: payload.modelMode || this.getModelMode() || 'auto'
    }
    const res = await this._requestExternal(url, {
      method: 'POST',
      body,
      methodName: 'ai.turn'
    })
    const data = this._unwrap(res)
    return { text: (data && data.text) || '', raw: data }
  }

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

  // Last-resort workspace pointer (every call site prefers
  // `_context.activeWorkspaceId`, which boot sets per tab).
  //
  // MWT-aware by precedence, without importing the shell's
  // activeWorkspacePointer (wrong dependency direction — the shell depends on
  // the SDK): with multi-workspace tabs ON the tab's own pointer lives in
  // `sessionStorage`, while `localStorage` holds only the shared "last default"
  // a fresh tab seeds from. Reading localStorage first made the assistant answer
  // about whichever workspace the BROWSER last defaulted to rather than the tab
  // you're looking at. With MWT OFF sessionStorage is never written, so this
  // falls through to the identical localStorage read as before.
  _readActiveWorkspace () {
    try {
      const perTab = globalThis.sessionStorage?.getItem('activeWorkspace')
      if (perTab) return perTab
    } catch (_) { /* sessionStorage unavailable — fall through */ }
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
