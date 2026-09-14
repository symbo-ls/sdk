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

// `family` — the session FAMILY every analyzed read narrows to
// (CORE-ANALYZED-KIND-UTC-TOTALS-ROLLUPS-1): 'workspace' = the my.symbols
// shell used by the team, 'projects' = visitors of published sites /
// tenant apps. The server (AnalyzedController._familyMatch) keeps the two
// apart on the write-time `kind` label and classifies pre-label rows by
// the legacy projectId rule; absent → unfiltered (legacy behaviour).
const _setFamily = (params, filter) => {
  const family = filter?.family
  if (family != null && family !== '') params.set('family', String(family))
}

// `tz` — the viewer's IANA zone for the calendar rollups (now / weekly /
// changes / totals). The server validates it against its own zone list
// and falls back to UTC; every such response echoes the zone it used.
const _setTz = (params, filter) => {
  const tz = filter?.tz
  if (tz != null && tz !== '') params.set('tz', String(tz))
}

// `since` for the window-scoped reads — accepts a Date or an ISO string.
const _setSince = (params, filter) => {
  const since = filter?.since
  if (since == null || since === '') return
  params.set('since', since instanceof Date ? since.toISOString() : String(since))
}

// First-touch UTM filters (CORE-ANALYZED-UTM-ATTRIBUTION-1) on listSessions
// / totals: `filter.utmSource` / `utmMedium` / `utmCampaign` → the same-
// named query params. The server matches EXACTLY after its own write-side
// normalisation (trim, source / medium lower-cased), so a row value echoed
// back always matches; the `__none__` sentinel selects sessions with no
// such field (the direct bucket — like `__anonymous__` for userId).
export const UTM_FILTER_KEYS = ['utmSource', 'utmMedium', 'utmCampaign']
export const UTM_NONE = '__none__'

const _setUtm = (params, filter) => {
  for (const key of UTM_FILTER_KEYS) {
    const v = filter?.[key]
    if (v != null && v !== '') params.set(key, String(v))
  }
}

// AnalyzedService wraps the main server's /core/analyzed/* routes (Mongo-
// backed). First-class main-server surface, NOT workspace-project worker
// routes — all calls go through _call() which routes to ${apiUrl}/core/
// analyzed/*.
//
// Every read forwards `filter.family` ('workspace' | 'projects') and the
// calendar rollups (now / weekly / changes / totals) forward `filter.tz`
// (IANA zone) — see _setFamily / _setTz above. `totals`, `pages` and
// `referrers` are the overall-totals section (CORE-ANALYZED-KIND-UTC-
// TOTALS-ROLLUPS-1).
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

  // GET /core/analyzed/sessions?userId=&visitorId=&projectId=&family=&since=&country=&utmSource=&utmMedium=&utmCampaign=&limit=&offset=
  listSessions (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (filter.country) params.set('country', filter.country)
    _setUtm(params, filter)
    // One visitor's sessions (the first-party visitor id — addendum).
    if (filter.visitorId) params.set('visitorId', String(filter.visitorId))
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

  // GET /core/analyzed/events?sessionId=&logType=&projectId=&family=&since=&order=&limit=&offset=
  listEvents (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
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

  // GET /core/analyzed/users?projectId=&family=&since=&limit=&offset=
  // Server-side aggregation (legacy analyzed_user_summaries shape).
  listUsers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listUsers', `/analyzed/users${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/active-users?projectId=&family=&limit=&offset=
  // Org-scoped active users — returns [{userId, userName, userEmail, lastSeenAt}].
  activeUsers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.activeUsers', `/analyzed/active-users${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/changes?range=<filter.range>&projectId=&family=&tz=
  // Monthly signups/activity over a range (defaults to last 12 months),
  // month boundaries on the `tz` calendar. Returns { tz, monthly: [{label, count}] }.
  changes (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    _setTz(params, filter)
    if (filter.range) params.set('range', filter.range)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.changes', `/analyzed/changes${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/demographics?projectId=&family=&since=
  // Country-level visitor breakdown. Returns { countries: [{country, count, code}] }.
  demographics (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    const qs = params.toString()
    return this._call('analyzed.demographics', `/analyzed/demographics${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/now?projectId=&family=&tz=
  // Real-time dashboard snapshot. Returns { tz, usersNow, usersToday (since local
  // midnight in tz), hourly: [{hour (0..23 in tz), count}],
  // activeSessions: [{id, name, email, awake, browser, os, resolution, location,
  // duration, sessionCount, path, updates, ip, referrer}] }.
  now (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    _setTz(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.now', `/analyzed/now${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/weekly?projectId=&family=&tz=
  // Week-over-week comparison on the `tz` calendar.
  // Returns { tz, pastWeek: [{label, count}], thisWeek: [{label, count}] }.
  weekly (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    _setTz(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.weekly', `/analyzed/weekly${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/bugs?projectId=&family=&since=&limit=&offset=
  // Bug clusters — $group by message, sorted by frequency desc.
  listBugs (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listBugs', `/analyzed/bugs${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/totals?family=&projectId=&excludeProjectId=&since=&tz=&utmSource=&utmMedium=&utmCampaign=
  // Overall totals for one window (`since` → now; absent = all retained
  // history) over the chosen family / project scope. Returns
  // { tz, window: { since, until }, sessions, uniqueUsers, uniqueVisitors,
  //   pageViews, events, bugs, errors, avgDurationMs, countries, projects,
  //   attributed, activeNow, allTime: { sessions, uniqueVisitors, pageViews } }.
  // `attributed` = sessions with a first-touch utmSource / utmCampaign; a
  // utm filter narrows the whole response to one campaign's sessions.
  totals (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    _setTz(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    _setSince(params, filter)
    _setUtm(params, filter)
    const qs = params.toString()
    return this._call('analyzed.totals', `/analyzed/totals${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/pages?family=&projectId=&excludeProjectId=&since=&limit=&offset=
  // Top page paths from page-view events. Returns { data: [{ path, views, sessions }] }
  // sorted views desc; limit default 10, max 50.
  pages (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    _setSince(params, filter)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.pages', `/analyzed/pages${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/referrers?family=&projectId=&excludeProjectId=&since=&limit=
  // Sessions per referrer host. Returns { data: [{ host, sessions }], direct }
  // where `direct` counts sessions with no referrer; limit default 10, max 50.
  referrers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    _setSince(params, filter)
    if (options.limit != null) params.set('limit', String(options.limit))
    const qs = params.toString()
    return this._call('analyzed.referrers', `/analyzed/referrers${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/daily?family=&projectId=&excludeProjectId=&days=&tz=
  // Per-local-day series (addendum 2): the last `filter.days` (default 12,
  // max 90) calendar days in `filter.tz` ending today, zero-filled. Returns
  // { tz, days: [{ date: 'YYYY-MM-DD', visitors, sessions, pageViews }] } —
  // visitors = distinct visitor keys that day.
  daily (filter = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter)
    _setFamily(params, filter)
    _setTz(params, filter)
    if (filter.days != null && filter.days !== '') params.set('days', String(filter.days))
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    const qs = params.toString()
    return this._call('analyzed.daily', `/analyzed/daily${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/campaigns?family=&projectId=&excludeProjectId=&since=&groupBy=&limit=&offset=
  // First-touch campaign attribution (CORE-ANALYZED-UTM-ATTRIBUTION-1):
  // attributed sessions (a utmSource or utmCampaign) in the window grouped
  // by `filter.groupBy` = 'campaign' (default) | 'source' | 'medium' |
  // 'content' | 'term'. Returns
  // { groupBy, window: { since, until }, direct,
  //   data: [{ key, source, medium, campaign, sessions, uniqueVisitors,
  //            pageViews, bugs }] }
  // sorted sessions desc (key asc on ties); `direct` = sessions with no
  // attribution; limit default 20, max 100; 30-day default window. No tz —
  // nothing here is a calendar bucket.
  campaigns (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setWorkspace(params, filter, options)
    _setFamily(params, filter)
    if (filter.groupBy) params.set('groupBy', String(filter.groupBy))
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.excludeProjectId) params.set('excludeProjectId', filter.excludeProjectId)
    _setSince(params, filter)
    _setUtm(params, filter)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.campaigns', `/analyzed/campaigns${qs ? `?${qs}` : ''}`)
  }
}
