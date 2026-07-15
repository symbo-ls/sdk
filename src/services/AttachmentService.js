import { BaseService } from './BaseService.js'

// AttachmentService wraps the main server's /core/attachments/* routes (Mongo-
// backed) — "files on anything", the §7.4 spine capability from
// WORKSPACE_DATA_MODEL. It joins an existing File to any registered entity;
// the File itself is never touched by these routes (DELETE hard-detaches only
// the link row). Peer to the other §7 spine surfaces. Reached via
// sdk.execute('attachments', …) — Mongo-native convention, no flat
// SERVICE_METHODS entry.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see CommentService for the contract). Reads are
// member-gated; writes require workspace editor. Everything keys on
// `entityRef { type, id }` (a registered EntityRef — unregistered → 400).
//
// NOTE: the server exposes list + create + remove only — there is no GET
// /attachments/:id and no update route.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class AttachmentService extends BaseService {
  // GET /core/attachments?entityType=&entityId= (member; both required — the
  // list is always scoped to ONE entity). workspaceId optional.
  //   filter: { entityType, entityId, workspaceId? }
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType != null) extra.entityType = filter.entityType
    if (filter.entityId != null) extra.entityId = filter.entityId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('attachments.list', `/attachments${_qs(ws, extra)}`)
  }

  // POST /core/attachments (editor; validates entityRef, requires file).
  // payload: { entityRef: { type, id }, file, label? } — `file` is a File id.
  create (payload = {}, { workspaceId } = {}) {
    return this._call('attachments.create', `/attachments${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // DELETE /core/attachments/:id (editor; hard-detaches the link — the File
  // stays).
  remove (id, { workspaceId } = {}) {
    return this._call('attachments.remove', `/attachments/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createAttachmentService = config => new AttachmentService(config)
