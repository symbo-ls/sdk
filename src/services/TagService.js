import { BaseService } from './BaseService.js'

// TagService wraps the main server's /core/tags/* routes (Mongo-backed) — the
// workspace tag REGISTRY, the §7.5 spine capability from WORKSPACE_DATA_MODEL.
// It governs color / rename / grouping / autocomplete; the actual ASSIGNMENT
// stays the inline `labels: [String]` arrays on Ticket/Doc (§7.5) — this
// surface never touches those. Peer to the other §7 spine surfaces. Reached
// via sdk.execute('tags', …) — Mongo-native convention, no flat
// SERVICE_METHODS entry.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see CommentService for the contract). Reads are
// member-gated; writes require workspace editor. `key` (the slug the label
// arrays map to) is unique per workspace (duplicate → 409) and IMMUTABLE —
// update changes label/color/group only.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class TagService extends BaseService {
  // GET /core/tags?group= (member; group filter optional). workspaceId optional.
  //   filter: { group?, workspaceId? }
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.group != null) extra.group = filter.group
    const ws = filter.workspaceId || options.workspaceId
    return this._call('tags.list', `/tags${_qs(ws, extra)}`)
  }

  // GET /core/tags/:id (member).
  get (id, { workspaceId } = {}) {
    return this._call('tags.get', `/tags/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/tags (editor; unique key per workspace — duplicate → 409).
  // payload: { key, label?, color?, group? }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('tags.create', `/tags${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/tags/:id (editor; label/color/group — `key` is immutable).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('tags.update', `/tags/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/tags/:id (editor; drops the registry entry — inline label
  // assignments are untouched).
  remove (id, { workspaceId } = {}) {
    return this._call('tags.remove', `/tags/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createTagService = config => new TagService(config)
