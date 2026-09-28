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

// Activity filters (CRM spec 1.4) — joined with ',' when an array is given.
const ACTIVITY_FILTERS = [
  'status',
  'owner',
  'dueFrom',
  'dueTo',
  'followUpFrom',
  'followUpTo'
]
const PAGING = ['limit', 'offset', 'page']
const _v = (v) =>
  Array.isArray(v) ? v.map(String).join(',') : v instanceof Date ? v.toISOString() : String(v)

export class InteractionService extends BaseService {
  // GET /core/interactions?partyId=&kind=&regardingType=&regardingId=&since=
  // plus the activity filters (CRM 1.4): status ('planned'|'done'|
  // 'cancelled', or an array), owner ('me' | 'none' | userId), dueFrom/dueTo,
  // followUpFrom/followUpTo, and options.sort ('dueAt.asc', 'occurredAt.desc',
  // …). Paging is OPT-IN: pass options.limit / offset / page and the rows
  // array comes back with `.pagination` = { page, limit, offset, totalCount,
  // pages, hasMore } attached; without them the call is unpaged, as before.
  async list (filter = {}, options = {}) {
    const extra = {}
    if (filter.partyId) extra.partyId = filter.partyId
    if (filter.kind) extra.kind = filter.kind
    if (filter.regardingType) extra.regardingType = filter.regardingType
    if (filter.regardingId) extra.regardingId = filter.regardingId
    if (filter.since) extra.since = filter.since
    for (const k of ACTIVITY_FILTERS) {
      if (filter[k] !== undefined && filter[k] !== null && filter[k] !== '') extra[k] = _v(filter[k])
    }
    const sort = options.sort ?? filter.sort
    if (sort) extra.sort = String(sort)
    let paged = false
    for (const k of PAGING) {
      const v = options[k] ?? filter[k]
      if (v !== undefined && v !== null && v !== '') {
        extra[k] = String(v)
        paged = true
      }
    }
    const ws = filter.workspaceId || options.workspaceId
    if (!paged) return this._call('interactions.list', `/interactions${_qs(ws, extra)}`)
    this._requireReady('interactions.list')
    const response = await this._request(`/interactions${_qs(ws, extra)}`, {
      method: 'GET',
      methodName: 'interactions.list'
    })
    if (!response || response.success === false) {
      throw new Error(response?.message || 'interactions.list failed')
    }
    const rows = Array.isArray(response.data) ? response.data : []
    if (response.pagination) rows.pagination = response.pagination
    return rows
  }

  // GET /core/interactions/my-day?date=YYYY-MM-DD&tz=<IANA> — the caller's
  // PLANNED activities overdue + due today in their zone (default: the
  // user's timezone, else UTC) →
  // { date, tz, from, to, overdue: [...], today: [...], counts: { overdue, today } }
  myDay ({ date, tz, workspaceId } = {}) {
    const extra = {}
    if (date) extra.date = String(date)
    if (tz) extra.tz = String(tz)
    return this._call('interactions.myDay', `/interactions/my-day${_qs(workspaceId, extra)}`)
  }

  // Complete an activity — PATCH { status: 'done', ...extra } (editor). The
  // server stamps doneAt/doneBy and occurredAt; extra may carry outcome/body.
  markDone (id, extra = {}, { workspaceId } = {}) {
    return this._call(
      'interactions.markDone',
      `/interactions/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'PATCH', body: { ...extra, status: 'done' } }
    )
  }

  // GET /core/interactions/:id
  get (id, { workspaceId } = {}) {
    return this._call('interactions.get', `/interactions/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/interactions (member — logging a touch is a member action).
  // payload — the server's writable fields (interactions store
  // `_writableInteraction`); any other key is silently DROPPED:
  //   { kind, parties: [partyId, …], direction?: 'in' | 'out' | null,
  //     subject?, body?, outcome?, occurredAt?, followUpAt?, durationMin?,
  //     regarding?: { type, id }, recording?, transcript?, source?, custom?,
  //     status?: 'planned' | 'done' | 'cancelled' (default done — a logged
  //     touch), dueAt?, owner? (userId; default: the caller) }
  // A planned activity regarding a lead/deal updates that entity's
  // nextActivity / lastActivityAt / rotAt server-side.
  // `kind` is required. There is no `partyId` / `summary` field: a create
  // that sends them stores an interaction with no party and no text.
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
