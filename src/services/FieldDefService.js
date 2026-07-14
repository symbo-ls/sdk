import { BaseService } from './BaseService.js'

// FieldDefService wraps the main server's /core/field-defs/* routes (Mongo-
// backed) — the custom-field-definition surface from WORKSPACE_DATA_MODEL
// §7 (CustomFieldDef) / §8 T1. Definitions attach typed fields to any
// entity type (shared or `record:<collectionKey>`); values live in each
// row's `custom` bag. Peer service to sdk.tickets / sdk.docs.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param). Reads member-gated; writes owner/admin.
// `key` and `entityType` are immutable after create.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class FieldDefService extends BaseService {
  // GET /core/field-defs?entityType=&includeArchived=true
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType) extra.entityType = filter.entityType
    if (filter.includeArchived || options.includeArchived) extra.includeArchived = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('fieldDefs.list', `/field-defs${_qs(ws, extra)}`)
  }

  // GET /core/field-defs/:id
  get (id, { workspaceId } = {}) {
    return this._call('fieldDefs.get', `/field-defs/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/field-defs (owner/admin).
  // payload: { entityType, key, label?, type, options?, required?,
  //            defaultValue?, position?, group?, aiHint? }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('fieldDefs.create', `/field-defs${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/field-defs/:id (owner/admin; key/entityType immutable).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('fieldDefs.update', `/field-defs/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/field-defs/:id (owner/admin).
  remove (id, { workspaceId } = {}) {
    return this._call('fieldDefs.remove', `/field-defs/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createFieldDefService = config => new FieldDefService(config)
