import { BaseService } from './BaseService.js'

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

  // GET /core/analyzed/sessions?userId=&projectId=&since=&limit=&offset=
  listSessions (filter = {}, options = {}) {
    const params = new URLSearchParams()
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call(
      'analyzed.listSessions',
      `/analyzed/sessions${qs ? `?${qs}` : ''}`
    )
  }

  // GET /core/analyzed/sessions/:id
  getSession (id) {
    return this._call(
      'analyzed.getSession',
      `/analyzed/sessions/${encodeURIComponent(id)}`
    )
  }

  // GET /core/analyzed/events?sessionId=&logType=&projectId=&since=&order=&limit=&offset=
  listEvents (filter = {}, options = {}) {
    const params = new URLSearchParams()
    if (filter.sessionId) params.set('sessionId', filter.sessionId)
    if (filter.logType) params.set('logType', filter.logType)
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.since) params.set('since', filter.since)
    if (options.order) params.set('order', options.order)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listEvents', `/analyzed/events${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/users?projectId=&since=&limit=&offset=
  // Server-side aggregation replaces the Supabase analyzed_user_summaries view.
  listUsers (filter = {}, options = {}) {
    const params = new URLSearchParams()
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listUsers', `/analyzed/users${qs ? `?${qs}` : ''}`)
  }

  // GET /core/analyzed/bugs?projectId=&since=&limit=&offset=
  // Bug clusters — $group by message, sorted by frequency desc.
  listBugs (filter = {}, options = {}) {
    const params = new URLSearchParams()
    if (filter.projectId) params.set('projectId', filter.projectId)
    if (filter.since) params.set('since', filter.since)
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    const qs = params.toString()
    return this._call('analyzed.listBugs', `/analyzed/bugs${qs ? `?${qs}` : ''}`)
  }
}
