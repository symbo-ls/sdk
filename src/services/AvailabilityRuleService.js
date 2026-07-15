import { BaseService } from './BaseService.js'

// AvailabilityRuleService wraps the main server's /core/availability-rules/*
// routes (Mongo-backed) — "the formalized per-user freebusy" from
// WORKSPACE_DATA_MODEL §6.8, Phase 4. A rule belongs to one `user` (a member);
// the server defaults `user` to the caller on create (A2 — a member manages
// their own availability) and treats it as immutable thereafter. DELETE is a
// tombstone, never a hard delete (A3). Peer service to sdk.bookings /
// sdk.conversations / sdk.recurrences.
//
// NOTE the route mounts at the kebab-case /core/availability-rules; the SDK
// service + dispatcher entity are the camelCase `availabilityRules`.
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

export class AvailabilityRuleService extends BaseService {
  // GET /core/availability-rules?user=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.user) extra.user = filter.user
    const ws = filter.workspaceId || options.workspaceId
    return this._call('availabilityRules.list', `/availability-rules${_qs(ws, extra)}`)
  }

  // GET /core/availability-rules/:id
  get (id, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.get',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`
    )
  }

  // POST /core/availability-rules (editor; `user` defaults to the caller, A2).
  // payload: { user?, weekly?: [{ dow, from, to }], tz?, overrides?, source?,
  //            custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('availabilityRules.create', `/availability-rules${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/availability-rules/:id (editor; `user` immutable, A2).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.update',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'PATCH', body: payload }
    )
  }

  // DELETE /core/availability-rules/:id (editor; tombstone, never hard, A3).
  remove (id, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.remove',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }
}

export const createAvailabilityRuleService = config => new AvailabilityRuleService(config)
