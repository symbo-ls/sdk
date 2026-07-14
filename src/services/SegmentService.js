import { BaseService } from './BaseService.js'

// SegmentService wraps the main server's /core/segments/* routes (Mongo-
// backed) — saved audiences from WORKSPACE_DATA_MODEL §5.5, Phase 2. A
// Segment is a named set of parties, either a static snapshot (frozen member
// list) or a smart query (re-evaluated on read). Peer service to
// sdk.tickets / sdk.docs / sdk.parties.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param). Reads are member-gated; writes require
// workspace editor. DELETE is a tombstone, never a hard delete.
//
// listMembers resolves the audience: for a static segment it returns the
// frozen snapshot; for a smart segment the server evaluates the query live.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class SegmentService extends BaseService {
  // GET /core/segments?includeDeleted=true
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.includeDeleted || options.includeDeleted) extra.includeDeleted = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('segments.list', `/segments${_qs(ws, extra)}`)
  }

  // GET /core/segments/:id
  get (id, { workspaceId } = {}) {
    return this._call('segments.get', `/segments/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/segments (editor).
  // payload: { name, kind: 'static'|'smart', query?, memberIds?, description?,
  //            ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('segments.create', `/segments${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/segments/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('segments.update', `/segments/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/segments/:id (editor; tombstone, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('segments.remove', `/segments/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // GET /core/segments/:id/members (member; static snapshot | smart eval).
  listMembers (id, { workspaceId } = {}) {
    return this._call(
      'segments.listMembers',
      `/segments/${encodeURIComponent(id)}/members${_qs(workspaceId)}`
    )
  }
}

export const createSegmentService = config => new SegmentService(config)
