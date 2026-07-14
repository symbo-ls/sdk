import { BaseService } from './BaseService.js'

// AiChatService wraps the MAIN SERVER /chat/* routes (Mongo-backed).
//
// Replaces the legacy Supabase ai-chat edge function path
// (`workspaceProject.aiChat` rpc → /workspace-project/ai/chat → Supabase
// edge fn). The new flow is end-to-end Mongo: threads + messages persist
// in chat_threads / chat_messages collections; LLM call routes through
// @symbo-ls/ai-providers (ModelRouterService) on the server.
//
// Streaming uses POST + SSE response (the `_streamPost` BaseService helper)
// — NOT EventSource — because EventSource is GET-only and can't carry a
// chat message payload. Wire format matches the legacy edge fn so the
// existing browser parsers (aiAssistant.aiStream) can swap with minimal
// changes.
export class AiChatService extends BaseService {
  // Resolve the { orgId, workspaceId } tenant scope an aiChat call should
  // carry: an explicit caller-supplied value wins per-key; otherwise falls
  // back to the SDK's own `_context.activeOrgId` / `_context.activeWorkspaceId`
  // (kept fresh by sdk.switchOrg/switchWorkspace). Mirrors
  // WorkspaceProjectService._chatWorkspaceId (see "workspace-scoping gaps in
  // the chat transport", sdk@5a8d798) — sent for BOTH keys: `workspaceId` is
  // the new primary key the server's resolveWorkspaceId reads, `orgId` is
  // kept for back-compat with today's req.user.activeOrganization inference.
  // Returns `undefined` for a key when neither source has a value, so
  // callers can omit the param entirely (byte-identical request when no
  // tenant context is set anywhere).
  _aiChatScope (scope) {
    return {
      orgId: scope?.orgId ?? this._context?.activeOrgId ?? undefined,
      workspaceId: scope?.workspaceId ?? this._context?.activeWorkspaceId ?? undefined
    }
  }

  // ==================== THREADS ====================

  threads = {
    list: ({ includeArchived = false, orgId, workspaceId } = {}) => {
      const scope = this._aiChatScope({ orgId, workspaceId })
      const params = new URLSearchParams()
      if (includeArchived) params.set('includeArchived', 'true')
      if (scope.orgId !== undefined) params.set('orgId', String(scope.orgId))
      if (scope.workspaceId !== undefined) params.set('workspaceId', String(scope.workspaceId))
      const qs = params.toString()
      return this._call('aiChat.threads.list', `/ai-chat/threads${qs ? `?${qs}` : ''}`)
    },
    get: (threadId, { orgId, workspaceId } = {}) => {
      const scope = this._aiChatScope({ orgId, workspaceId })
      const params = new URLSearchParams()
      if (scope.orgId !== undefined) params.set('orgId', String(scope.orgId))
      if (scope.workspaceId !== undefined) params.set('workspaceId', String(scope.workspaceId))
      const qs = params.toString()
      return this._call(
        'aiChat.threads.get',
        `/ai-chat/threads/${encodeURIComponent(threadId)}${qs ? `?${qs}` : ''}`
      )
    },
    // workspaceId + orgId (default from _context) are sent as query params
    // — NOT folded into the POST body — so the new thread lands in the
    // caller's intended tenant instead of relying on the server's
    // req.user.activeOrganization fallback, which can be momentarily stale
    // right after switchOrg/switchWorkspace.
    create: (payload = {}, { orgId, workspaceId } = {}) => {
      const scope = this._aiChatScope({ orgId, workspaceId })
      const params = new URLSearchParams()
      if (scope.orgId !== undefined) params.set('orgId', String(scope.orgId))
      if (scope.workspaceId !== undefined) params.set('workspaceId', String(scope.workspaceId))
      const qs = params.toString()
      return this._call('aiChat.threads.create', `/ai-chat/threads${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        body: { payload }
      })
    },
    remove: (threadId) =>
      this._call('aiChat.threads.remove', `/ai-chat/threads/${encodeURIComponent(threadId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== MESSAGES ====================

  messages = {
    list: (threadId, { limit, beforeId, orgId, workspaceId } = {}) => {
      const scope = this._aiChatScope({ orgId, workspaceId })
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (beforeId) params.set('beforeId', beforeId)
      if (scope.orgId !== undefined) params.set('orgId', String(scope.orgId))
      if (scope.workspaceId !== undefined) params.set('workspaceId', String(scope.workspaceId))
      const qs = params.toString()
      return this._call(
        'aiChat.messages.list',
        `/ai-chat/threads/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ''}`
      )
    }
  }

  // ==================== COMPLETION (non-streaming) ====================

  // Runs a single AI turn and returns the full assistant text.
  //
  // Either supply `threadId + content` (server persists user + assistant
  // messages, hydrates transcript from the thread), OR supply `messages`
  // (legacy ephemeral shape — server doesn't persist anything).
  //
  // Payload fields:
  //   threadId?, content?, messages?, attachedCard?, systemPromptOverride?, model?
  //   orgId?, workspaceId? — tenant scope; defaults from _context when omitted
  //   (see _aiChatScope). Folded into the POSTed payload (not query params)
  //   so the persisted turn is scoped even if the token's activeOrganization
  //   claim is momentarily stale right after switchOrg/switchWorkspace.
  //
  // Returns: { text, action, thread, userMessage, assistantMessage, usage }
  completion (payload) {
    const scope = this._aiChatScope(payload)
    const scopedPayload = { ...payload }
    if (scope.orgId !== undefined) scopedPayload.orgId = scope.orgId
    if (scope.workspaceId !== undefined) scopedPayload.workspaceId = scope.workspaceId
    return this._call('aiChat.completion', '/ai-chat/completion', {
      method: 'POST',
      body: { payload: scopedPayload }
    })
  }

  // ==================== STREAMING ====================

  // Runs a single AI turn with SSE-streamed deltas.
  //
  // payload — same shape as completion(), including the optional
  // orgId/workspaceId tenant scope (see _aiChatScope; folded into the
  // POSTed payload just like completion()).
  // callbacks:
  //   onChunk(deltaText)      — fires for each text delta
  //   onDone(donePayload)     — fires once with { text, action, assistantMessageId, thread, usage }
  //   onError(err)            — fires on transport or upstream error
  //
  // Returns: cancel() — abort the in-flight stream
  stream (payload, { onChunk, onDone, onError } = {}) {
    const scope = this._aiChatScope(payload)
    const scopedPayload = { ...payload }
    if (scope.orgId !== undefined) scopedPayload.orgId = scope.orgId
    if (scope.workspaceId !== undefined) scopedPayload.workspaceId = scope.workspaceId
    return this._streamPost('/ai-chat/stream', { payload: scopedPayload }, { onChunk, onDone, onError })
  }

  // ==================== MEET-ANALYZE ====================

  // Extract actionable items + summary from a meeting transcript.
  // Replaces the legacy Supabase meet-analyze edge function. Returns the
  // analysis record { room_id, workspace_id, summary, suggestions:{…},
  // model, generated_at } OR { pending: true, reason: 'no_transcript' }
  // when the room has no transcript yet — matches the legacy shape so
  // analyzeTranscript.js consumers don't have to change.
  //
  // payload: { roomId, force? }
  meetAnalyze (payload) {
    return this._call('aiChat.meetAnalyze', '/ai-chat/meet-analyze', {
      method: 'POST',
      body: { payload }
    })
  }
}

export const createAiChatService = (config) => new AiChatService(config)
