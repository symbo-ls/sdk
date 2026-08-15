import { BaseService } from './BaseService.js'

// PartyService wraps the main server's /core/parties/* routes (Mongo-backed)
// — the Party Directory from WORKSPACE_DATA_MODEL §5, Phase 2. A Party is the
// polymorphic actor record (person | company | any custom kind) that every
// interaction, segment, and record can point at. Peer service to
// sdk.tickets / sdk.docs / sdk.workflows.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see ProposedActionService for the contract).
// Reads are member-gated; writes require workspace editor. DELETE is a
// tombstone, never a hard delete.
//
// Sub-resources hang off a party id: roles (a party's typed hats —
// customer/vendor/… — upserted by (party, role)) and relationships (typed
// edges to other parties, listed in both directions). removeRelationship
// targets the edge by its own id at the collection-level
// /parties/relationships/:relId path.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class PartyService extends BaseService {
  // GET /core/parties?kind=&role=&owner=&q=&includeArchived=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    if (filter.role) extra.role = filter.role
    if (filter.owner) extra.owner = filter.owner
    if (filter.q) extra.q = filter.q
    if (filter.includeArchived || options.includeArchived) extra.includeArchived = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('parties.list', `/parties${_qs(ws, extra)}`)
  }

  // GET /core/parties/:id
  get (id, { workspaceId } = {}) {
    return this._call('parties.get', `/parties/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/parties (editor).
  // payload: { kind, name, emails?, phones?, addresses?, owner?, tags?,
  //            custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('parties.create', `/parties${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/parties/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('parties.update', `/parties/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/parties/:id (editor; tombstone, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('parties.remove', `/parties/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // ── Roles (a party's typed hats — upsert by (party, role)) ────────────────

  // GET /core/parties/:id/roles (member).
  listRoles (partyId, { workspaceId } = {}) {
    return this._call(
      'parties.listRoles',
      `/parties/${encodeURIComponent(partyId)}/roles${_qs(workspaceId)}`
    )
  }

  // POST /core/parties/:id/roles (editor; upserts by (party, role)).
  // payload: { role, ...roleFields }
  addRole (partyId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'parties.addRole',
      `/parties/${encodeURIComponent(partyId)}/roles${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  // DELETE /core/parties/:id/roles/:role (editor).
  removeRole (partyId, role, { workspaceId } = {}) {
    return this._call(
      'parties.removeRole',
      `/parties/${encodeURIComponent(partyId)}/roles/${encodeURIComponent(role)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }

  // ── Relationships (typed edges to other parties, both directions) ─────────

  // GET /core/parties/:id/relationships (member; both directions).
  listRelationships (partyId, { workspaceId } = {}) {
    return this._call(
      'parties.listRelationships',
      `/parties/${encodeURIComponent(partyId)}/relationships${_qs(workspaceId)}`
    )
  }

  // POST /core/parties/:id/relationships (editor).
  // payload: { bId, kind }
  addRelationship (partyId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'parties.addRelationship',
      `/parties/${encodeURIComponent(partyId)}/relationships${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  // DELETE /core/parties/relationships/:relId (editor; targets the edge by id).
  removeRelationship (relId, { workspaceId } = {}) {
    return this._call(
      'parties.removeRelationship',
      `/parties/relationships/${encodeURIComponent(relId)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }

  // ── Bulk (org chart — tickets/sonnet.md "bulk-read route + admin bulk
  // editor + minimal chart view") ────────────────────────────────────────

  // GET /core/parties/relationships (member). EVERY edge in the workspace,
  // one call — the whole-team read `listRelationships` above cannot do (it
  // is per-party, both directions; a chart view fanning that out per person
  // is an N+1 that does not scale). filter: { kind? }
  listAllRelationships (filter = {}, { workspaceId } = {}) {
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    const ws = filter.workspaceId || workspaceId
    return this._call('parties.listAllRelationships', `/parties/relationships${_qs(ws, extra)}`)
  }

  // POST /core/parties/relationships/reports-to (admin). Bulk set/clear the
  // `reports_to` manager for many parties in one admin submission.
  // assignments: [{ partyId, managerId }] — managerId: null clears. The
  // whole batch validates (self-reference, cross-tenant existence, and
  // reporting-cycle freedom of the RESULTING graph) before anything is
  // written — a bad row 400/404/409s the whole call, never a partial chart.
  setManagers (assignments = [], { workspaceId } = {}) {
    return this._call(
      'parties.setManagers',
      `/parties/relationships/reports-to${_qs(workspaceId)}`,
      { method: 'POST', body: { assignments } }
    )
  }
}

export const createPartyService = config => new PartyService(config)
