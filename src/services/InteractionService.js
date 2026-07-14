import { BaseService } from './BaseService.js'

// InteractionService wraps the main server's /core/interactions/* routes
// (Mongo-backed) — the party-facing touchpoint log from
// WORKSPACE_DATA_MODEL §5.4, Phase 2. An Interaction records a single touch
// (call, email, meeting, note, …) against a Party and optionally "regarding"
// some other entity (a ticket, deal record, doc, …). Peer service to
// sdk.tickets / sdk.docs / sdk.parties.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param). Reads are member-gated; logging a touch
// (create) is a member action, but update/remove require workspace editor.
// DELETE is a tombstone, never a hard delete.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class InteractionService extends BaseService {
  // GET /core/interactions?partyId=&kind=&regardingType=&regardingId=&since=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.partyId) extra.partyId = filter.partyId
    if (filter.kind) extra.kind = filter.kind
    if (filter.regardingType) extra.regardingType = filter.regardingType
    if (filter.regardingId) extra.regardingId = filter.regardingId
    if (filter.since) extra.since = filter.since
    const ws = filter.workspaceId || options.workspaceId
    return this._call('interactions.list', `/interactions${_qs(ws, extra)}`)
  }

  // GET /core/interactions/:id
  get (id, { workspaceId } = {}) {
    return this._call('interactions.get', `/interactions/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/interactions (member — logging a touch is a member action).
  // payload: { partyId, kind, regardingType?, regardingId?, occurredAt?,
  //            summary?, body?, direction?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('interactions.create', `/interactions${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/interactions/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('interactions.update', `/interactions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/interactions/:id (editor; tombstone, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('interactions.remove', `/interactions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createInteractionService = config => new InteractionService(config)
