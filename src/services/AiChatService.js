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
  // ==================== THREADS ====================

  threads = {
    list: ({ includeArchived = false } = {}) => {
      const qs = includeArchived ? '?includeArchived=true' : ''
      return this._call('aiChat.threads.list', `/ai-chat/threads${qs}`)
    },
    get: (threadId) =>
      this._call('aiChat.threads.get', `/ai-chat/threads/${encodeURIComponent(threadId)}`),
    create: (payload = {}) =>
      this._call('aiChat.threads.create', '/ai-chat/threads', {
        method: 'POST',
        body: { payload }
      }),
    remove: (threadId) =>
      this._call('aiChat.threads.remove', `/ai-chat/threads/${encodeURIComponent(threadId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== MESSAGES ====================

  messages = {
    list: (threadId, { limit, beforeId } = {}) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (beforeId) params.set('beforeId', beforeId)
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
  //
  // Returns: { text, action, thread, userMessage, assistantMessage, usage }
  completion (payload) {
    return this._call('aiChat.completion', '/ai-chat/completion', {
      method: 'POST',
      body: { payload }
    })
  }

  // ==================== STREAMING ====================

  // Runs a single AI turn with SSE-streamed deltas.
  //
  // payload — same shape as completion()
  // callbacks:
  //   onChunk(deltaText)      — fires for each text delta
  //   onDone(donePayload)     — fires once with { text, action, assistantMessageId, thread, usage }
  //   onError(err)            — fires on transport or upstream error
  //
  // Returns: cancel() — abort the in-flight stream
  stream (payload, { onChunk, onDone, onError } = {}) {
    return this._streamPost('/ai-chat/stream', { payload }, { onChunk, onDone, onError })
  }
}

export const createAiChatService = (config) => new AiChatService(config)
