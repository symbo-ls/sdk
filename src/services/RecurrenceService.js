import { BaseService } from './BaseService.js'

// RecurrenceService wraps the main server's /core/recurrences/* routes (Mongo-
// backed) — "the generic rrule scheduler" from WORKSPACE_DATA_MODEL §6.5,
// Phase 4. A Recurrence pairs a template EntityRef (§7 — a template Ticket or
// Invoice the registry validates, R2) with an rrule (R3, required); the cron
// that FIRES due recurrences is a later slice, so `lastRunAt` is scheduler-
// owned and NOT client-writable (R4). DELETE is a tombstone, never a hard
// delete (R5). Peer service to sdk.bookings / sdk.availabilityRules /
// sdk.conversations.
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

export class RecurrenceService extends BaseService {
  // GET /core/recurrences?enabled=&templateType=&templateId=
  list (filter = {}, options = {}) {
    const extra = {}
    // enabled is tri-state (true | false | absent) — thread it whenever set,
    // including the boolean `false`, so a falsy check must NOT swallow it.
    if (filter.enabled !== undefined && filter.enabled !== null) {
      extra.enabled = String(filter.enabled)
    }
    if (filter.templateType) extra.templateType = filter.templateType
    if (filter.templateId) extra.templateId = filter.templateId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('recurrences.list', `/recurrences${_qs(ws, extra)}`)
  }

  // GET /core/recurrences/:id
  get (id, { workspaceId } = {}) {
    return this._call('recurrences.get', `/recurrences/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/recurrences (editor; template + rrule required, R2/R3).
  // payload: { template: { type, id }, rrule, nextAt?, tz?, enabled?, source?,
  //            custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('recurrences.create', `/recurrences${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/recurrences/:id (editor; lastRunAt scheduler-owned, not
  // client-writable — R4).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('recurrences.update', `/recurrences/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/recurrences/:id (editor; tombstone, never hard, R5).
  remove (id, { workspaceId } = {}) {
    return this._call('recurrences.remove', `/recurrences/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createRecurrenceService = config => new RecurrenceService(config)
