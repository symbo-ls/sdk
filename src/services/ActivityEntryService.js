import { BaseService } from './BaseService.js'

// ActivityEntryService wraps the main server's /core/activity-entries/* route
// (Mongo-backed) — the §7 timeline READ surface (WORKSPACE_DATA_MODEL
// §6.9/§7.7). Peer to the other §7 spine surfaces. Reached via
// sdk.execute('activityEntries', …) — Mongo-native convention, no flat
// SERVICE_METHODS entry.
//
// READ-ONLY. There is deliberately NO create/update/remove: activity entries
// are emitted server-internally by ActivityService, structural in the store
// layer (§14.5) — never over a route. This service only lists.
//
// Note the URL is kebab-case (`/core/activity-entries`) while the SDK service /
// entity name is camelCase (`activityEntries`).
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see CommentService for the contract). Two read
// shapes: `?entityType=&entityId=` for ONE entity's timeline (newest first),
// or `?since=&limit=` for the workspace-wide feed (server caps limit).

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class ActivityEntryService extends BaseService {
  // GET /core/activity-entries?entityType=&entityId= (one entity's timeline)
  // OR ?since=&limit= (the workspace feed). member-gated. workspaceId optional.
  //   filter:  { entityType?, entityId?, since?, limit?, workspaceId? }
  //   options: { since?, limit?, workspaceId? } — fallback for the feed params.
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.entityType != null) extra.entityType = filter.entityType
    if (filter.entityId != null) extra.entityId = filter.entityId
    const since = filter.since ?? options.since
    const limit = filter.limit ?? options.limit
    if (since != null) extra.since = since
    if (limit != null) extra.limit = limit
    const ws = filter.workspaceId || options.workspaceId
    return this._call('activityEntries.list', `/activity-entries${_qs(ws, extra)}`)
  }
}

export const createActivityEntryService = config => new ActivityEntryService(config)
