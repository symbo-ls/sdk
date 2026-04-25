import { BaseService } from './BaseService.js'

// Calls the workspace wrapper at next.api.symbols.app/workspace/* (or
// ${apiUrl}/workspace/* in dev/staging). Built on top of @symbo.ls/server-workspace.
//
// Distinct from WorkspaceService — that one CRUDs workspace org records
// via /core/workspaces. This one is the typed data surface for the
// workspace app (editor/packages/workspace) and any other in-workspace consumer.
//
// Auth: every request carries a JWT in `Authorization: Bearer ...`. The
// JWT must include `sub` (user id) + `workspace_id` (or
// `app_metadata.workspace_id`) claims — the workspace wrapper extracts
// them server-side and constructs an RLS-scoped client. Consumers never
// see the wrapper's Supabase service-role key.
//
// Token source resolution (first non-null wins):
//   1. context.workspaceTokenProvider() — caller-supplied async fn
//      returning { token } | string | null. Use this in the workspace
//      app to forward the user's Supabase access token (which carries
//      the right claims via custom_access_token_hook).
//   2. this._tokenManager.getAuthHeader() — Mongo SDK fallback for
//      contexts that don't run their own JWT issuer.
export class WorkspaceDataService extends BaseService {
  init({ context }) {
    super.init({ context })
    this._workspacePrefix = (context?.workspaceApiUrl || this._apiUrl) + '/workspace'
    this._tokenProvider = context?.workspaceTokenProvider || null
  }

  async _resolveAuthHeader() {
    if (this._tokenProvider) {
      try {
        const result = await this._tokenProvider()
        if (!result) return null
        if (typeof result === 'string') return `Bearer ${result}`
        if (result.token) return `Bearer ${result.token}`
        if (result.access_token) return `Bearer ${result.access_token}`
      } catch {}
    }
    if (this._tokenManager) {
      try {
        await this._tokenManager.ensureValidToken()
        return this._tokenManager.getAuthHeader()
      } catch {}
    }
    return null
  }

  async _ws(methodName, endpoint, { method = 'GET', body, headers } = {}) {
    this._requireReady(methodName)
    const url = `${this._workspacePrefix}${endpoint}`
    const init = { method, headers: { ...(headers || {}) } }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
      init.headers['Content-Type'] = 'application/json'
    }
    const auth = await this._resolveAuthHeader()
    if (auth) init.headers.Authorization = auth
    const res = await fetch(url, init)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.message || json?.error?.message || `HTTP ${res.status}`)
    return json
  }

  // --- Tickets ----------------------------------------------------------------
  tickets = {
    list: (filter, options) =>
      this._ws('tickets.list', '/tickets', { method: 'POST', body: { filter, options } }),
    get: (number) => this._ws('tickets.get', `/tickets/${encodeURIComponent(number)}`),
    create: (payload) =>
      this._ws('tickets.create', '/tickets', { method: 'POST', body: { payload } }),
    update: (number, payload) =>
      this._ws('tickets.update', `/tickets/${encodeURIComponent(number)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    remove: (number) =>
      this._ws('tickets.remove', `/tickets/${encodeURIComponent(number)}`, { method: 'DELETE' }),
    epicCounts: () => this._ws('tickets.epicCounts', '/tickets/epic-counts'),
    assign: (id, assigneeEmail) =>
      this._ws('tickets.assign', `/tickets/${encodeURIComponent(id)}/assign`, {
        method: 'POST',
        body: { assigneeEmail },
      }),
  }

  // --- Chat -------------------------------------------------------------------
  chat = {
    listChannels: () => this._ws('chat.listChannels', '/chat/channels'),
    createChannel: (payload) =>
      this._ws('chat.createChannel', '/chat/channels', { method: 'POST', body: { payload } }),
    listMessages: (channelId) =>
      this._ws('chat.listMessages', `/chat/channels/${encodeURIComponent(channelId)}/messages`),
    sendMessage: (channelId, payload) =>
      this._ws('chat.sendMessage', `/chat/channels/${encodeURIComponent(channelId)}/messages`, {
        method: 'POST',
        body: { payload },
      }),
    listMembers: (channelId) =>
      this._ws('chat.listMembers', `/chat/channels/${encodeURIComponent(channelId)}/members`),
  }

  // --- Calendar ---------------------------------------------------------------
  calendar = {
    listEvents: (filter) =>
      this._ws('calendar.listEvents', '/calendar/events', {
        method: 'POST',
        body: { filter },
      }),
    createEvent: (payload) =>
      this._ws('calendar.createEvent', '/calendar/events', { method: 'POST', body: { payload } }),
    updateEvent: (id, payload) =>
      this._ws('calendar.updateEvent', `/calendar/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    deleteEvent: (id) =>
      this._ws('calendar.deleteEvent', `/calendar/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    sync: (params) => this._ws('calendar.sync', '/calendar/sync', { method: 'POST', body: { params } }),
  }

  // --- Meet -------------------------------------------------------------------
  meet = {
    listRooms: () => this._ws('meet.listRooms', '/meet/rooms'),
    createRoom: (payload) =>
      this._ws('meet.createRoom', '/meet/rooms', { method: 'POST', body: { payload } }),
    getRoom: (id) => this._ws('meet.getRoom', `/meet/rooms/${encodeURIComponent(id)}`),
    listMembers: (id) =>
      this._ws('meet.listMembers', `/meet/rooms/${encodeURIComponent(id)}/members`),
    listTranscripts: (id) =>
      this._ws('meet.listTranscripts', `/meet/rooms/${encodeURIComponent(id)}/transcripts`),
    waitingRoom: () => this._ws('meet.waitingRoom', '/meet/waiting-room'),
    issueToken: (params) =>
      this._ws('meet.issueToken', '/meet/token', { method: 'POST', body: { params } }),
  }

  // --- Documents --------------------------------------------------------------
  documents = {
    list: () => this._ws('documents.list', '/documents'),
    create: (payload) =>
      this._ws('documents.create', '/documents', { method: 'POST', body: { payload } }),
    get: (id) => this._ws('documents.get', `/documents/${encodeURIComponent(id)}`),
    update: (id, payload) =>
      this._ws('documents.update', `/documents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    listKb: () => this._ws('documents.listKb', '/documents/kb'),
    listResourceLinks: () => this._ws('documents.listResourceLinks', '/documents/resource-links'),
    addResourceLink: (payload) =>
      this._ws('documents.addResourceLink', '/documents/resource-links', {
        method: 'POST',
        body: { payload },
      }),
  }

  // --- Presence ---------------------------------------------------------------
  presence = {
    online: () => this._ws('presence.online', '/presence/online'),
    heartbeat: () => this._ws('presence.heartbeat', '/presence/heartbeat', { method: 'POST' }),
  }

  // --- Notifications ----------------------------------------------------------
  notifications = {
    list: () => this._ws('notifications.list', '/notifications'),
    unreadCount: () => this._ws('notifications.unreadCount', '/notifications/unread-count'),
    markRead: (id) =>
      this._ws('notifications.markRead', `/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
      }),
    markAllRead: () =>
      this._ws('notifications.markAllRead', '/notifications/mark-all-read', { method: 'POST' }),
  }

  // --- Search -----------------------------------------------------------------
  search = (q, opts) =>
    this._ws('search', '/search', { method: 'POST', body: { q, ...opts } })

  // --- Permissions ------------------------------------------------------------
  permissions = {
    me: () => this._ws('permissions.me', '/permissions/me'),
    check: (action, resource) =>
      this._ws('permissions.check', '/permissions/check', {
        method: 'POST',
        body: { action, resource },
      }),
  }

  // --- System -----------------------------------------------------------------
  system = {
    status: () => this._ws('system.status', '/system/status'),
    featureFlags: () => this._ws('system.featureFlags', '/system/feature-flags'),
  }

  // --- People -----------------------------------------------------------------
  people = {
    list: () => this._ws('people.list', '/people'),
    get: (id) => this._ws('people.get', `/people/${encodeURIComponent(id)}`),
    me: () => this._ws('people.me', '/people/me'),
  }

  // --- Activity ---------------------------------------------------------------
  activity = {
    listNotes: () => this._ws('activity.listNotes', '/activity/notes'),
    addNote: (payload) =>
      this._ws('activity.addNote', '/activity/notes', { method: 'POST', body: { payload } }),
    scoringConfig: () => this._ws('activity.scoringConfig', '/activity/scoring-config'),
  }

  // --- Generic escape hatch ---------------------------------------------------
  query = (body) => this._ws('query', '/query', { method: 'POST', body })
}
