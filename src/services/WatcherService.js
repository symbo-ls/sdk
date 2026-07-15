import { BaseService } from './BaseService.js'

// WatcherService wraps the main server's /core/watchers/* routes (Mongo-
// backed) — subscribe anyone to any registered entity, the §7.6 spine
// capability from WORKSPACE_DATA_MODEL. One notification fan-out mechanism for
// the whole spine. Peer to the other §7 spine surfaces. Reached via
// sdk.execute('watchers', …) — Mongo-native convention, no flat
// SERVICE_METHODS entry.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see CommentService for the contract). Everything
// keys on `entityRef { type, id }` (a registered EntityRef — unregistered →
// 400).
//
// Self-vs-other: watching/unwatching YOURSELF is a member action; managing
// ANOTHER user's watch requires editor — a row-level gate the server enforces
// (omit `userEmail` and the server stamps the caller). `watch` is a POST
// UPSERT: one row per (workspace, entityRef, userEmail); re-watching updates
// `level` in place (one of the server's WATCHER_LEVELS). `unwatch` is a DELETE
// BY QUERY (no id) — it targets the (entityRef, userEmail) row.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class WatcherService extends BaseService {
  // GET /core/watchers?entityType=&entityId= (who watches this entity) OR
  // ?userEmail= (what this user watches). At least one scope is required
  // server-side. workspaceId optional.
  //   filter: { entityType?, entityId?, userEmail?, workspaceId? }
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType != null) extra.entityType = filter.entityType
    if (filter.entityId != null) extra.entityId = filter.entityId
    if (filter.userEmail != null) extra.userEmail = filter.userEmail
    const ws = filter.workspaceId || options.workspaceId
    return this._call('watchers.list', `/watchers${_qs(ws, extra)}`)
  }

  // POST /core/watchers — upsert (member self / editor others).
  // payload: { entityRef: { type, id }, level?, userEmail? } — omit userEmail
  // to watch as the caller. Re-watching the same (entityRef, userEmail) updates
  // `level` in place.
  watch (payload = {}, { workspaceId } = {}) {
    return this._call('watchers.watch', `/watchers${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // DELETE /core/watchers?entityType=&entityId=&userEmail= — unwatch by query
  // (member self / editor others; no id). entityType + entityId are required
  // server-side; omit userEmail to unwatch the caller. workspaceId optional.
  //   filter: { entityType, entityId, userEmail?, workspaceId? }
  unwatch (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType != null) extra.entityType = filter.entityType
    if (filter.entityId != null) extra.entityId = filter.entityId
    if (filter.userEmail != null) extra.userEmail = filter.userEmail
    const ws = filter.workspaceId || options.workspaceId
    return this._call('watchers.unwatch', `/watchers${_qs(ws, extra)}`, {
      method: 'DELETE'
    })
  }
}

export const createWatcherService = config => new WatcherService(config)
