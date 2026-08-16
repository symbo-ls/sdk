import { BaseService } from './BaseService.js'

// `workspaceId` is a ROUTING param (the multi-tab contract — see
// EntityDispatcher's FLAT-ARGS note and server/src/core/middleware/
// workspaceScope.js `attachExplicitWorkspaceIfMember`): the tab says which
// workspace it views; the server honours it ONLY when the caller is a
// member, else falls back to the caller's active claim. Every read below
// forwards it from `filter.workspaceId || options.workspaceId`. Before this
// (ANALYTICS-WS-SCOPE-1) the whitelist DROPPED it, so a dashboard whose URL
// named workspace B, viewed by a user whose Mongo claim was org A, got a
// clean 200 with zero rows — "no data" that was really "wrong scope".
const _setWorkspace = (params, filter, options) => {
  const ws = filter?.workspaceId ?? options?.workspaceId
  if (ws != null && ws !== '') params.set('workspaceId', String(ws))
}

// AnalyzedService wraps the main server's /core/analyzed/* routes (Mongo-
// backed). First-class main-server surface, NOT workspace-project worker
// routes — all calls go through _call() which routes to ${apiUrl}/core/
// analyzed/*.
//
// Peer service to sdk.tickets and sdk.docs. See architecture/MODEL.md
// §"Visitor telemetry — Mongo migration".

export class AnalyzedService extends BaseService {
  // POST /core/analyzed/ingest — authenticated dogfood / workspace shell
  // path. workspace is resolved from req.user.activeWorkspace on the
  // server side; the SDK just forwards the envelope.
  ingest (envelope) {
    return this._call('analyzed.ingest', '/analyzed/ingest', {
      method: 'POST',
      body: envelope
    })
  }

  // POST /core/analyzed/ingest-public — mermaid-only HMAC-signed s2s.
  // SDK doesn't normally call this directly (mermaid worker does), but
  // exposed for completeness + tests.
  ingestPublic (envelope, signature) {
    return this._call('analyzed.ingestPublic', '/analyzed/ingest-public', {
      method: 'POST',
      headers: { 'x-mermaid-signature': signature },
      body: envelope
    })
  }

  // GET /core/analyzed/sessions?userId=&projectId=&since=&country=&limit=&offset=
  listSessions (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (filter.country) params.set('country', filter.country)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call(
      'analyzed.listSessions',
      `/analyzed/sessions${qs ? `?${qs}` : ''}`
    )
  }

  // GET /core/analyzed/sessions/:id?workspaceId=
  getSession (id, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, null, options)
    const qs = params.toString()
    return this._call(
      'analyzed.getSession',
      `/analyzed/sessions/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
    )
  }

  // GET /core/analyzed/events?sessionId=&logType=&projectId=&since=&order=&limit=&offset=
  listEvents (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    if (filter.sessionId) params.set('sessionId', filter.sessionId)
    if (filter.logType) params.set('logType', filter.logType)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (options.order) params.set('order', options.order)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listEvents', `/analyzed/events${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/users?projectId=&since=&limit=&offset=
  // Server-side aggregation (legacy analyzed_user_summaries shape).
  listUsers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listUsers', `/analyzed/users${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/active-users?projectId=&limit=&offset=
  // Org-scoped active users — returns [{userId, userName, userEmail, lastSeenAt}].
  activeUsers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.activeUsers', `/analyzed/active-users${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/changes?range=<filter.range>&projectId=
  // Monthly signups/activity over a range (defaults to last 12 months).
  // Returns { monthly: [{label, count}] }.
  changes (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    if (filter.range) params.set('range', filter.range)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.changes', `/analyzed/changes${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/demographics?projectId=&since=
  // Country-level visitor breakdown. Returns { countries: [{country, count, code}] }.
  demographics (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    const qs = params.toString()
    return this._call('analyzed.demographics', `/analyzed/demographics${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/now?projectId=
  // Real-time dashboard snapshot. Returns { usersNow, usersToday, hourly: [{hour, count}],
  // activeSessions: [{id, name, email, awake, browser, os, resolution, location,
  // duration, sessionCount, path, updates, ip, referrer}] }.
  now (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.now', `/analyzed/now${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/weekly?projectId=
  // Week-over-week comparison. Returns { pastWeek: [{label, count}], thisWeek: [{label, count}] }.
  weekly (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.weekly', `/analyzed/weekly${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/bugs?projectId=&since=&limit=&offset=
  // Bug clusters — $group by message, sorted by frequency desc.
  listBugs (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listBugs', `/analyzed/bugs${qs ? `?${qs}` : ''}`)
  }
}
