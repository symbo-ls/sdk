import { BaseService } from './BaseService.js'

// CommentService wraps the main server's /core/comments/* routes (Mongo-
// backed) — threaded discussion on ANY registered entity, the §7.3 spine
// capability from WORKSPACE_DATA_MODEL. Peer service to sdk.tickets / sdk.docs
// and to the other §7 spine surfaces (attachments, watchers, activityEntries,
// tags). Reached via sdk.execute('comments', …) — Mongo-native convention, no
// flat SERVICE_METHODS entry.
//
// Every route is workspace-scoped server-side: the workspace is resolved from
// the caller's active-workspace claim, so imperative callers may omit
// workspaceId and rely on the claim (declarative `fetch:` always does). An
// explicit `workspaceId` is threaded as a query param when a caller needs to
// target a specific workspace — the server's workspaceScope middleware reads
// `?workspaceId=` first, then falls back to the claim, and verifies membership
// either way (a foreign id fails closed 403).
//
// Everything keys on `entityRef { type, id }` (a registered EntityRef —
// unregistered → 400). Commenting is a MEMBER action; edit/delete carry a
// row-level author-or-editor gate the server enforces (a member may touch
// their OWN comment; only an editor may touch someone else's). DELETE is a
// soft tombstone so reply threads survive.
//
// NOTE: the server exposes NO GET /comments/:id — a single comment is only
// ever read through the entity-scoped `list`. There is intentionally no
// `get(id)` method here (see the §7 spine slice notes).

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class CommentService extends BaseService {
  // GET /core/comments?entityType=&entityId= (member; both required — the list
  // is always scoped to ONE entity's thread). workspaceId optional.
  //   filter: { entityType, entityId, workspaceId? }
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType != null) extra.entityType = filter.entityType
    if (filter.entityId != null) extra.entityId = filter.entityId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('comments.list', `/comments${_qs(ws, extra)}`)
  }

  // POST /core/comments (member; validates entityRef).
  // payload: { entityRef: { type, id }, body, replyTo?, reactions?, source? }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('comments.create', `/comments${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/comments/:id (member; author-or-editor; a body change stamps
  // editedAt server-side). payload: { body?, reactions? }
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('comments.update', `/comments/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/comments/:id (member; author-or-editor; soft tombstone — the
  // thread is kept).
  remove (id, { workspaceId } = {}) {
    return this._call('comments.remove', `/comments/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createCommentService = config => new CommentService(config)
