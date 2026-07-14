import { BaseService } from './BaseService.js'

// RecordCollectionService wraps the main server's /core/record-collections/*
// routes (Mongo-backed) — the records-plane collection-definition surface
// from WORKSPACE_DATA_MODEL §8 T2. A RecordCollection turns the free-form
// WorkspaceRecord bucket into a real custom object: label, field defs,
// title field, lifecycle Workflow, numbering, default view, AI opt-ins.
// Peer service to sdk.tickets / sdk.docs.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param). Reads member-gated; writes owner/admin.
// `key` is immutable; DELETE is archive-only (tombstone) and 403s when the
// collection is `protected` (app-owned).

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class RecordCollectionService extends BaseService {
  // GET /core/record-collections?includeDeleted=true
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.includeDeleted || options.includeDeleted) extra.includeDeleted = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('recordCollections.list', `/record-collections${_qs(ws, extra)}`)
  }

  // GET /core/record-collections/:id — id or collection key.
  get (id, { workspaceId } = {}) {
    return this._call(
      'recordCollections.get',
      `/record-collections/${encodeURIComponent(id)}${_qs(workspaceId)}`
    )
  }

  // POST /core/record-collections (owner/admin).
  // payload: { key, label?, labelSingular?, icon?, description?, titleField?,
  //            workflow?, numbering?, defaultView?, aiEnabled?,
  //            embeddingEnabled?, source?, protected? }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('recordCollections.create', `/record-collections${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/record-collections/:id (owner/admin; key immutable).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'recordCollections.update',
      `/record-collections/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'PATCH', body: payload }
    )
  }

  // DELETE /core/record-collections/:id (owner/admin; archive-only tombstone,
  // 403 when protected).
  remove (id, { workspaceId } = {}) {
    return this._call(
      'recordCollections.remove',
      `/record-collections/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }
}

export const createRecordCollectionService = config => new RecordCollectionService(config)
