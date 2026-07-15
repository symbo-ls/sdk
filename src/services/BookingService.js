import { BaseService } from './BaseService.js'

// BookingService wraps the main server's /core/bookings/* routes (Mongo-
// backed) — "the party-facing scheduled commitment" from
// WORKSPACE_DATA_MODEL §6.8, Phase 4. The store assigns an immutable BKG-
// number on create (`kind` is create-time identity, both stripped from
// updates); `confirm` transitions requested → confirmed. Bookings are never
// hard-deleted: `remove` maps to the server's CANCEL (status 'cancelled', B4)
// so the row survives for no-show / audit. Peer service to
// sdk.availabilityRules / sdk.conversations / sdk.recurrences.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Reads are
// member-gated; writes require workspace editor.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class BookingService extends BaseService {
  // GET /core/bookings?status=&party=&host=&kind=&since=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.status) extra.status = filter.status
    if (filter.party) extra.party = filter.party
    if (filter.host) extra.host = filter.host
    if (filter.kind) extra.kind = filter.kind
    if (filter.since) extra.since = filter.since
    const ws = filter.workspaceId || options.workspaceId
    return this._call('bookings.list', `/bookings${_qs(ws, extra)}`)
  }

  // GET /core/bookings/:id
  get (id, { workspaceId } = {}) {
    return this._call('bookings.get', `/bookings/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/bookings (editor; assigns immutable BKG- number).
  // payload: { kind, party?, host?, service?, event?, invoice?, startAt?,
  //            endAt?, status?, location?, attendees?: [{ kind, id }], source?,
  //            custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('bookings.create', `/bookings${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/bookings/:id (editor; kind/number stripped, B3).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('bookings.update', `/bookings/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // POST /core/bookings/:id/confirm (editor; requested → confirmed, no body).
  confirm (id, { workspaceId } = {}) {
    return this._call('bookings.confirm', `/bookings/${encodeURIComponent(id)}/confirm${_qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // DELETE /core/bookings/:id (editor; CANCEL — status 'cancelled', the row is
  // kept for no-show / audit, B4 — never a hard delete).
  remove (id, { workspaceId } = {}) {
    return this._call('bookings.remove', `/bookings/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createBookingService = config => new BookingService(config)
