import { BaseService } from './BaseService.js'

// ConversationService wraps the main server's /core/conversations/* routes
// (Mongo-backed) — "the party-facing two-way thread + its messages" from
// WORKSPACE_DATA_MODEL §6.7, Phase 4. A Conversation is the durable thread; the
// message log hangs off /:id/messages. Logging a message is a MEMBER action
// (not an editor write) and bumps the parent's lastMessageAt (C4). DELETE is a
// tombstone, never a hard delete (C3) — 'closed' is a distinct status reached
// via update. Peer service to sdk.bookings / sdk.availabilityRules /
// sdk.recurrences.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Conversation
// reads are member-gated, writes require editor; the message sub-resource
// (list + add) is member-gated in both directions (logging, not authoring).

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class ConversationService extends BaseService {
  // GET /core/conversations?status=&party=&assignee=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.status) extra.status = filter.status
    if (filter.party) extra.party = filter.party
    if (filter.assignee) extra.assignee = filter.assignee
    const ws = filter.workspaceId || options.workspaceId
    return this._call('conversations.list', `/conversations${_qs(ws, extra)}`)
  }

  // GET /core/conversations/:id
  get (id, { workspaceId } = {}) {
    return this._call('conversations.get', `/conversations/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/conversations (editor).
  // payload: { channel?, party?, subject?, status?, assignee?, ticket?,
  //            custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('conversations.create', `/conversations${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/conversations/:id (editor; channel immutable).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('conversations.update', `/conversations/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/conversations/:id (editor; tombstone, never hard, C3).
  remove (id, { workspaceId } = {}) {
    return this._call('conversations.remove', `/conversations/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // ── Messages (the thread's log — a MEMBER action; bumps lastMessageAt) ─────

  // GET /core/conversations/:id/messages (member).
  listMessages (id, { workspaceId } = {}) {
    return this._call(
      'conversations.listMessages',
      `/conversations/${encodeURIComponent(id)}/messages${_qs(workspaceId)}`
    )
  }

  // POST /core/conversations/:id/messages (member; bumps parent lastMessageAt).
  // payload: { direction, from?, to?, body?, attachments? }
  addMessage (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'conversations.addMessage',
      `/conversations/${encodeURIComponent(id)}/messages${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }
}

export const createConversationService = config => new ConversationService(config)
