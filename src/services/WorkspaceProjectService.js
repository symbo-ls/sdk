import { BaseService } from './BaseService.js'

const WORKSPACE_PROJECT_PREFIX = '/workspace-project'

// Compose a workspace-project base URL given an api base. Public so any
// consumer that needs the full `${apiBase}/workspace-project` URL (e.g.
// the Supabase passthrough adapter) reads it from the SDK rather than
// hard-coding the literal.
export const workspaceProjectBaseUrl = (apiBase) =>
  `${apiBase}${WORKSPACE_PROJECT_PREFIX}`

// Calls the workspace-project wrapper at next.api.symbols.app/workspace-project/*
// (or ${apiUrl}/workspace-project/* in dev/staging). Built on top of
// @symbo.ls/server-workspace-project.
//
// Distinct from WorkspaceService — that one CRUDs workspace org records
// via /core/workspaces. This one is the typed data surface for the
// workspace app (workspace/packages/workspace-project) and any other in-workspace consumer.
//
// Auth: every request carries a JWT in `Authorization: Bearer ...`. The
// JWT must include `sub` (user id) + `workspace_id` (or
// `app_metadata.workspace_id`) claims — the workspace wrapper extracts
// them server-side and constructs an RLS-scoped client. Consumers never
// see the wrapper's Supabase service-role key.
//
// Token source resolution (first non-null wins):
//   1. context.workspaceProjectTokenProvider() — caller-supplied async fn
//      returning { token } | string | null. Forwards the user's Supabase
//      access token (which carries the right claims via
//      custom_access_token_hook).
//   2. this._tokenManager.getAuthHeader() — Mongo SDK fallback for
//      contexts that don't run their own JWT issuer.
export class WorkspaceDataService extends BaseService {
  init({ context }) {
    super.init({ context })
    this._workspacePrefix = workspaceProjectBaseUrl(context?.workspaceApiUrl || this._apiUrl)
    this._tokenProvider = context?.workspaceProjectTokenProvider || null
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

  // PostgREST-style call routed through the workspace wrapper's existing
  // Supabase passthrough at /workspace/sb/rest/v1/*. Lets us expose any
  // workspace-tenant table on the SDK without writing a curated server
  // route per entity — RLS still enforces auth/scope server-side because
  // the passthrough forwards the user's bearer token unchanged.
  //
  // op vocabulary (matches sdk.execute):
  //   list   → GET /rest/v1/{table}?{filter as PostgREST query string}
  //   get    → GET /rest/v1/{table}?{single}=eq.{id}  (Accept: pgrst.object+json)
  //   create → POST /rest/v1/{table}                  (Prefer: return=representation)
  //   update → PATCH /rest/v1/{table}?id=eq.{id}      (Prefer: return=representation)
  //   remove → DELETE /rest/v1/{table}?id=eq.{id}
  //   rpc    → POST /rest/v1/rpc/{table}              (table doubles as fn name)
  //
  // filter shape (mirrors the curated wrappers):
  //   plain value  → eq.value
  //   array        → in.(a,b,c)
  //   { gte, lte, gt, lt, like, ilike, is, neq } → operator.value
  //   <key>_in: [..] → key=in.(a,b,c)        — convenience for prefilter
  //   null         → is.null
  //
  // options:
  //   columns: 'id,name'  → select=id,name
  //   order: 'name.asc' or 'name'
  //   limit, offset
  //   single: true   → use Accept: pgrst.object+json (returns one row)
  async _sb(methodName, table, op, args = {}) {
    this._requireReady(methodName)
    const { filter, payload, options = {} } = args || {}
    const idValue = options.id ?? args?.id

    const qs = new URLSearchParams()
    const _enc = (v) => (v === null ? 'null' : String(v))

    if (filter && typeof filter === 'object') {
      for (const [rawKey, val] of Object.entries(filter)) {
        if (val === undefined) continue
        // <key>_in: [a,b,c] convenience — translate to in.()
        if (rawKey.endsWith('_in') && Array.isArray(val)) {
          qs.append(rawKey.slice(0, -3), `in.(${val.map(_enc).join(',')})`)
          continue
        }
        if (val === null) {
          qs.append(rawKey, 'is.null')
        } else if (Array.isArray(val)) {
          qs.append(rawKey, `in.(${val.map(_enc).join(',')})`)
        } else if (typeof val === 'object') {
          // Operator form: { gte, lte, gt, lt, eq, neq, like, ilike, is }
          for (const [opName, opVal] of Object.entries(val)) {
            qs.append(rawKey, `${opName}.${_enc(opVal)}`)
          }
        } else {
          qs.append(rawKey, `eq.${_enc(val)}`)
        }
      }
    }
    if (op === 'get' && idValue !== undefined && !qs.has('id')) {
      qs.append('id', `eq.${_enc(idValue)}`)
    }
    if (op === 'update' && idValue !== undefined && !qs.has('id')) {
      qs.append('id', `eq.${_enc(idValue)}`)
    }
    if (op === 'remove' && idValue !== undefined && !qs.has('id')) {
      qs.append('id', `eq.${_enc(idValue)}`)
    }

    if (options.columns) qs.set('select', options.columns)
    if (options.order) qs.set('order', options.order)
    if (options.limit != null) qs.set('limit', String(options.limit))
    if (options.offset != null) qs.set('offset', String(options.offset))
    // PostgREST upsert: POST with `on_conflict=col1,col2` query string +
    // `Prefer: resolution=merge-duplicates`. Caller signals upsert via
    // options.upsertOnConflict — set on the create path.
    if (op === 'create' && options.upsertOnConflict) {
      qs.set('on_conflict', options.upsertOnConflict)
    }

    const httpMethod = (
      op === 'list' || op === 'get' ? 'GET'
      : op === 'create' ? 'POST'
      : op === 'update' ? 'PATCH'
      : op === 'remove' ? 'DELETE'
      : op === 'rpc' ? 'POST'
      : 'GET'
    )

    const restPath = op === 'rpc' ? `rpc/${encodeURIComponent(table)}` : encodeURIComponent(table)
    const queryStr = qs.toString()
    const url = `${this._workspacePrefix}/sb/rest/v1/${restPath}${queryStr ? '?' + queryStr : ''}`

    const init = { method: httpMethod, headers: {} }
    const auth = await this._resolveAuthHeader()
    if (auth) init.headers.Authorization = auth

    if (op === 'create' || op === 'update' || op === 'rpc') {
      init.body = JSON.stringify(payload ?? {})
      init.headers['Content-Type'] = 'application/json'
      if (op !== 'rpc') {
        // resolution=merge-duplicates only meaningful when on_conflict was
        // set above; harmless on plain create — server ignores it for
        // non-conflict cases.
        const prefer = options.upsertOnConflict
          ? 'resolution=merge-duplicates,return=representation'
          : 'return=representation'
        init.headers['Prefer'] = prefer
      }
    }

    if (op === 'get' || (op === 'list' && options.single)) {
      init.headers['Accept'] = 'application/vnd.pgrst.object+json'
    }

    const res = await fetch(url, init)
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = text }
    if (!res.ok) {
      const msg = (json && (json.message || json.error?.message)) || text || `HTTP ${res.status}`
      throw new Error(`[${methodName}] ${msg}`)
    }
    // Wrapper returns { status, data } envelope OR the raw rows depending
    // on whether the route went through `relay()` or the passthrough.
    // Passthrough returns the raw Supabase response body — array for list,
    // object for single. Hand it back as-is.
    return json
  }

  // Factory for the common (filter, options) / (id) / (id, payload) shape
  // — most table-only entity namespaces follow it. Each method returns the
  // raw _sb() promise so consumers see the unwrapped Supabase response.
  _sbCrud (table, listOptions = {}) {
    return {
      list: (filter, options) =>
        this._sb(`${table}.list`, table, 'list',
          { filter, options: { ...listOptions, ...(options || {}) } }),
      get: (id) =>
        this._sb(`${table}.get`, table, 'get', { id, options: { single: true } }),
      create: (payload) =>
        this._sb(`${table}.create`, table, 'create', { payload }),
      update: (id, payload) =>
        this._sb(`${table}.update`, table, 'update', { id, payload }),
      remove: (id) =>
        this._sb(`${table}.remove`, table, 'remove', { id }),
    }
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
    updateChannel: (channelId, payload) =>
      this._ws('chat.updateChannel', `/chat/channels/${encodeURIComponent(channelId)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    removeChannel: (channelId) =>
      this._ws('chat.removeChannel', `/chat/channels/${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
      }),

    listMessages: (channelId, options) =>
      this._ws('chat.listMessages', `/chat/channels/${encodeURIComponent(channelId)}/messages`, {
        ...(options ? { method: 'POST', body: { options } } : {}),
      }),
    sendMessage: (channelId, payload) =>
      this._ws('chat.sendMessage', `/chat/channels/${encodeURIComponent(channelId)}/messages`, {
        method: 'POST',
        body: { payload },
      }),
    updateMessage: (messageId, payload) =>
      this._ws('chat.updateMessage', `/chat/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    removeMessage: (messageId) =>
      this._ws('chat.removeMessage', `/chat/messages/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      }),
    toggleReaction: (messageId, emoji, userId) =>
      this._ws('chat.toggleReaction', `/chat/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: 'POST',
        body: { emoji, userId },
      }),

    listMembers: (channelId) =>
      this._ws('chat.listMembers', `/chat/channels/${encodeURIComponent(channelId)}/members`),
    addMember: (channelId, payload) =>
      this._ws('chat.addMember', `/chat/channels/${encodeURIComponent(channelId)}/members`, {
        method: 'POST',
        body: { payload },
      }),
    updateMember: (channelId, userId, payload) =>
      this._ws('chat.updateMember', `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    removeMember: (channelId, userId) =>
      this._ws('chat.removeMember', `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
    markRead: (channelId, userId, lastReadAt) =>
      this._ws('chat.markRead', `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}/read`, {
        method: 'POST',
        body: { lastReadAt },
      }),
    muteChannel: (channelId, userId, muted) =>
      this._ws('chat.muteChannel', `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}/mute`, {
        method: 'POST',
        body: { muted },
      }),

    listMentions: (filter, options) =>
      this._ws('chat.listMentions', '/chat/mentions', { method: 'POST', body: { filter, options } }),
    // Mark every chat_mention for the caller in a channel as read. Wraps the
    // chat_mark_mentions_read SQL function — see migration 0015.
    markMentionsRead: (channelId, callerEmail) =>
      this._ws('chat.markMentionsRead', `/chat/channels/${encodeURIComponent(channelId)}/mentions/read`, {
        method: 'POST',
        body: { callerEmail },
      }),
    // Full-text search over messages in channels the caller belongs to.
    // Wraps the chat_search_messages SQL function — see migration 0014.
    searchMessages: (q, callerEmail) =>
      this._ws('chat.searchMessages', '/chat/search', {
        method: 'POST',
        body: { q, callerEmail },
      }),
  }

  // --- Calendar ---------------------------------------------------------------
  calendar = {
    listEvents: (filter) =>
      this._ws('calendar.listEvents', '/calendar/events', {
        method: 'POST',
        body: { filter },
      }),
    getEvent: (id) =>
      this._ws('calendar.getEvent', `/calendar/events/${encodeURIComponent(id)}`),
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
    // Update a meet_rooms row — name, privacy, guest-join policy, etc.
    // Replaces direct sb.from('meet_rooms').update(...).eq('id', id) calls
    // in updateRoomSettings.js. RLS policy meet_rooms_update gates this to
    // the room creator/admins.
    updateRoom: (id, payload) =>
      this._ws('meet.updateRoom', `/meet/rooms/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    // Mark the room as ended (sets ended_at). Distinct PATCH ergonomically —
    // callers don't have to construct the timestamp; server stamps it.
    // Reopening a room flips ended_at back to null (see reopenRoom).
    endRoom: (id) =>
      this._ws('meet.endRoom', `/meet/rooms/${encodeURIComponent(id)}/end`, {
        method: 'POST',
      }),
    reopenRoom: (id) =>
      this._ws('meet.reopenRoom', `/meet/rooms/${encodeURIComponent(id)}/reopen`, {
        method: 'POST',
      }),
    listMembers: (id) =>
      this._ws('meet.listMembers', `/meet/rooms/${encodeURIComponent(id)}/members`),
    // Add a member row to a meet room. Replaces direct
    // sb.from('meet_room_members').insert(...) in createRoom.js — the
    // meet_members_insert RLS policy allows user_id = auth.uid() inserts
    // so self-join from a shared URL still works.
    addMember: (roomId, payload) =>
      this._ws('meet.addMember', `/meet/rooms/${encodeURIComponent(roomId)}/members`, {
        method: 'POST',
        body: { payload },
      }),
    listTranscripts: (id) =>
      this._ws('meet.listTranscripts', `/meet/rooms/${encodeURIComponent(id)}/transcripts`),
    // Raw transcribed utterances (was sb().from('meet_transcripts').select())
    // — individual speech segments, distinct from the higher-level
    // transcript analysis summaries returned by listTranscripts.
    listUtterances: (id) =>
      this._ws('meet.listUtterances', `/meet/rooms/${encodeURIComponent(id)}/utterances`),
    waitingRoom: () => this._ws('meet.waitingRoom', '/meet/waiting-room'),
    // Host actions on a meet_waiting_room row. RLS policy
    // meet_waiting_room_update gates these to the parent room's creator
    // via is_meet_room_owner. Replaces direct sb.from('meet_waiting_room')
    // .update() calls in updateRoomSettings.js.
    admitGuest: (waitingId) =>
      this._ws('meet.admitGuest', `/meet/waiting-room/${encodeURIComponent(waitingId)}/admit`, {
        method: 'POST',
      }),
    rejectGuest: (waitingId) =>
      this._ws('meet.rejectGuest', `/meet/waiting-room/${encodeURIComponent(waitingId)}/reject`, {
        method: 'POST',
      }),
    issueToken: (params) =>
      this._ws('meet.issueToken', '/meet/token', { method: 'POST', body: { params } }),
    // Combined transcript+analysis view — wraps the
    // `get_meet_transcript_view(uuid)` RPC. Returns
    // { utterances, analysis } in a single round-trip; replaces the
    // previous two-query pattern in MeetTranscriptPage.
    getTranscriptView: (roomId) =>
      this._ws('meet.getTranscriptView',
        `/meet/rooms/${encodeURIComponent(roomId)}/transcript-view`),
    // Patch the `applied_items` array on a meet_transcript_analyses row
    // when the user "applies" a suggestion (saves as note, creates
    // ticket, etc). RLS allows room members to modify this column only.
    updateAnalysisAppliedItems: (roomId, appliedItems) =>
      this._ws('meet.updateAnalysisAppliedItems',
        `/meet/rooms/${encodeURIComponent(roomId)}/analysis/applied-items`, {
          method: 'PATCH',
          body: { applied_items: appliedItems },
        }),
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
    remove: (id) =>
      this._ws('documents.remove', `/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    listKb: () => this._ws('documents.listKb', '/documents/kb'),
    // Create a knowledge-base article. Wraps the `kb_articles` table insert
    // so consumers (KnowledgeBase UI, AI auto-generated KB entries) can route
    // through the SDK rather than direct supabase.from('kb_articles').insert().
    createKbArticle: (payload) =>
      this._ws('documents.createKbArticle', '/documents/kb', {
        method: 'POST',
        body: { payload },
      }),
    // Update a knowledge-base article in-place (used by KB editor save +
    // saveKbArticle helper).
    updateKbArticle: (id, payload) =>
      this._ws('documents.updateKbArticle', `/documents/kb/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),

    // Documents-adjacent notes (separate `notes` table — distinct from
    // activity.listNotes which targets activity_log style entries).
    listNotes: () => this._ws('documents.listNotes', '/documents/notes'),
    // Create a personal/team note. Wraps the `notes` table insert so
    // consumers (Notes UI, "Save as note" buttons) can route through the
    // SDK rather than direct supabase.from('notes').insert().
    createNote: (payload) =>
      this._ws('documents.createNote', '/documents/notes', {
        method: 'POST',
        body: { payload },
      }),

    listResourceLinks: () => this._ws('documents.listResourceLinks', '/documents/resource-links'),
    addResourceLink: (payload) =>
      this._ws('documents.addResourceLink', '/documents/resource-links', {
        method: 'POST',
        body: { payload },
      }),
    updateResourceLink: (id, payload) =>
      this._ws('documents.updateResourceLink', `/documents/resource-links/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    removeResourceLink: (id) =>
      this._ws('documents.removeResourceLink', `/documents/resource-links/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    // Composite-key delete — unlink paths don't carry the row id, only the
    // (a_type, a_id, b_type, b_id) tuple. Kept distinct from
    // removeResourceLink(id) so callers express intent at the call site.
    removeResourceLinkByPair: (filter) =>
      this._ws('documents.removeResourceLinkByPair', '/documents/resource-links', {
        method: 'DELETE',
        body: { filter },
      }),

    // User-scoped personal documents (was sb().from('user_documents'))
    listUserDocuments: (userId) =>
      this._ws('documents.listUserDocuments', `/documents/users/${encodeURIComponent(userId || 'me')}`),
    createUserDocument: (payload) =>
      this._ws('documents.createUserDocument', '/documents/users', { method: 'POST', body: { payload } }),
    updateUserDocument: (id, payload) =>
      this._ws('documents.updateUserDocument', `/documents/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload },
      }),
    removeUserDocument: (id) =>
      this._ws('documents.removeUserDocument', `/documents/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
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
    // POSTs a single notification row through the wrapper. Replaces direct
    // sb().from('notifications').insert(...) in shared/functions/
    // notifications/createNotification.js.
    create: (payload) =>
      this._ws('notifications.create', '/notifications', { method: 'POST', body: { payload } }),
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
    // Bulk PATCH activity_scoring_config rows. The body shape is
    // { rows: [{ activity_type, enabled, score, … }, …] } — server iterates
    // and applies each (admin-gated). Returns { ok: true } on success.
    updateScoringConfig: (payload) =>
      this._ws('activity.updateScoringConfig', '/activity/scoring-config', {
        method: 'PATCH',
        body: { payload },
      }),
    // Aggregated activity_events count grid for the heatmap UI. Returns
    // rows from public.activity_events scoped to the caller and a date
    // range (defaults to the last 365 days). Heavily used by the
    // ActivityHeatmap component — the wrapper does the user_email +
    // workspace_id scoping server-side.
    heatmap: (filter) =>
      this._ws('activity.heatmap', '/activity/heatmap', {
        method: 'POST',
        body: { filter },
      }),
    // Per-day activity_events list for one user. Used by the heatmap
    // tooltip / details drawer.
    listEvents: (filter) =>
      this._ws('activity.listEvents', '/activity/events', {
        method: 'POST',
        body: { filter },
      }),
  }

  // ────────────────────────────────────────────────────────────────────────
  // Tenant tables routed through the existing /workspace/sb/rest/v1/* Supabase
  // passthrough — RLS enforces workspace_id scoping server-side, so the
  // frontend doesn't need a curated wrapper route per table. Each entity is
  // a thin `_sbCrud(<table>)` factory call; for tables that need filter
  // defaults (e.g. ticket_dependencies must always filter by ticket_id),
  // override the .list method explicitly.
  //
  // Why passthrough instead of curated routes: the wrapper's `sb.js` surface
  // already proxies the user's bearer token to Supabase REST, with RLS
  // policies as the only auth boundary. Adding 30 hand-written `relay()`
  // routes per table would just duplicate that scoping ceremony. Promote any
  // entity to a curated wrapper route only when it needs server-side
  // validation, denormalization, or composition.
  // ────────────────────────────────────────────────────────────────────────

  announcements = this._sbCrud('announcements')
  birthdays     = this._sbCrud('birthdays')
  stories       = this._sbCrud('stories')
  valuations    = this._sbCrud('valuations')

  // Single-row org metadata — companyInfo (key/value pairs) + companySettings
  // (one record per org). Provide list + upsert (PostgREST-merge) shapes
  // that match the legacy sb().from('company_info').upsert() call sites.
  companyInfo = {
    list: (filter, options) =>
      this._sb('companyInfo.list', 'company_info', 'list', { filter, options }),
    upsert: (payload) =>
      this._sb('companyInfo.upsert', 'company_info', 'create',
        { payload, options: { upsertOnConflict: 'key' } }),
  }
  companySettings = {
    get: () =>
      this._sb('companySettings.get', 'company_settings', 'list',
        { options: { single: true } }),
    update: (payload) =>
      // Single-row table; PATCH first matching row.
      this._sb('companySettings.update', 'company_settings', 'update',
        { id: 1, payload }),
  }

  // Per-user preferences — one row keyed by user_id. RLS scopes to caller.
  // Use `list` (not `single`) so a missing row returns [] instead of the
  // PostgREST "Cannot coerce the result to a single JSON object" error.
  // Caller treats null as "no prefs yet" and renders defaults.
  userPreferences = {
    get: async () => {
      const rows = await this._sb('userPreferences.get', 'user_preferences', 'list',
        { options: { limit: 1 } })
      return Array.isArray(rows) ? (rows[0] || null) : (rows || null)
    },
    upsert: (payload) =>
      this._sb('userPreferences.upsert', 'user_preferences', 'create',
        { payload, options: { upsertOnConflict: 'user_id' } }),
  }

  userGrants     = this._sbCrud('user_grants')

  // user_profiles is keyed by user_id, not numeric id. Override get/update.
  userProfiles = {
    list: (filter, options) =>
      this._sb('userProfiles.list', 'user_profiles', 'list', { filter, options }),
    get: (userId) =>
      this._sb('userProfiles.get', 'user_profiles', 'list',
        { filter: { user_id: userId }, options: { single: true } }),
    update: (userId, payload) =>
      this._sb('userProfiles.update', 'user_profiles', 'update',
        { filter: { user_id: userId }, payload }),
  }

  ticketColumns = {
    list: (filter, options) =>
      this._sb('ticketColumns.list', 'ticket_columns', 'list',
        { filter, options: { order: 'position.asc', ...(options || {}) } }),
    update: (id, payload) =>
      this._sb('ticketColumns.update', 'ticket_columns', 'update', { id, payload }),
  }

  // ticket_dependencies has a composite key (ticket_id + depends_on_ticket_id);
  // expose list scoped to a single ticket plus the standard create/remove.
  ticketDependencies = {
    list: (ticketId) =>
      this._sb('ticketDependencies.list', 'ticket_dependencies', 'list',
        { filter: { ticket_id: ticketId } }),
    create: (payload) =>
      this._sb('ticketDependencies.create', 'ticket_dependencies', 'create', { payload }),
    remove: (id) =>
      this._sb('ticketDependencies.remove', 'ticket_dependencies', 'remove', { id }),
  }

  // ticket_comments is per-ticket; .list takes a ticketId, others take id.
  ticketComments = {
    list: (ticketId, options) =>
      this._sb('ticketComments.list', 'ticket_comments', 'list', {
        filter: { ticket_id: ticketId },
        options: { order: 'created_at.asc', ...(options || {}) },
      }),
    create: (ticketId, payload) =>
      this._sb('ticketComments.create', 'ticket_comments', 'create',
        { payload: { ticket_id: ticketId, ...(payload || {}) } }),
    update: (id, payload) =>
      this._sb('ticketComments.update', 'ticket_comments', 'update', { id, payload }),
    remove: (id) =>
      this._sb('ticketComments.remove', 'ticket_comments', 'remove', { id }),
  }

  // Daily standup rows — one per (author_email, date). Upsert merges on
  // the unique index from migration 0033 so idempotent re-submits replace.
  standups = {
    list: (filter, options) =>
      this._sb('standups.list', 'standup_activity', 'list', { filter, options }),
    get: (id) =>
      this._sb('standups.get', 'standup_activity', 'get', { id }),
    create: (payload) =>
      this._sb('standups.create', 'standup_activity', 'create', { payload }),
    update: (id, payload) =>
      this._sb('standups.update', 'standup_activity', 'update', { id, payload }),
    upsert: (payload) =>
      this._sb('standups.upsert', 'standup_activity', 'create',
        { payload, options: { upsertOnConflict: 'author_email,date' } }),
  }

  // Audit log — backend table is `activity_events`. Filter shape passes
  // straight through PostgREST: { actor_email_in: [...], created_at: { gte } }
  auditLog = {
    list: (filter, options) =>
      this._sb('auditLog.list', 'activity_events', 'list', {
        filter,
        options: { order: 'created_at.desc', ...(options || {}) },
      }),
  }

  // Role permission catalog (admin read-only).
  rolePermissions = {
    list: () =>
      this._sb('rolePermissions.list', 'role_permissions', 'list', {
        options: { order: 'role,resource,action' },
      }),
  }

  // --- AI (workspace-scoped chat / analysis edge fns) ------------------------
  // Replaces direct fetch(`/functions/v1/ai-chat`, …) and meet-analyze /
  // meet-token edge calls scattered across the workspace UI.
  ai = {
    chat: (payload) =>
      this._ws('ai.chat', '/ai/chat', { method: 'POST', body: { payload } }),
    meetAnalyze: (payload) =>
      this._ws('ai.meetAnalyze', '/ai/meet-analyze', { method: 'POST', body: { payload } }),
  }

  // --- Agent walkie-talkie (Simona ↔ Chuvaka) — passthrough-routed ---------
  // Routes through /workspace/sb/rest/v1/agent_messages (RLS-scoped). Browser
  // path. The node ops path keeps a service-role REST fetch in
  // shared/functions/agentMessages.js — admin token issuance flow not yet
  // available outside a user session.
  agentMessages = {
    list: (filter, options) =>
      this._sb('agentMessages.list', 'agent_messages', 'list', { filter, options }),
    create: (payload) =>
      this._sb('agentMessages.create', 'agent_messages', 'create', { payload }),
    update: (id, payload) =>
      this._sb('agentMessages.update', 'agent_messages', 'update', { id, payload }),
    remove: (id) =>
      this._sb('agentMessages.remove', 'agent_messages', 'remove', { id }),
    // Realtime subscription stub — wires through socket once backend ships.
    subscribe: (_toAgent) => () => {},
  }

  // --- i18n (translation stream) --------------------------------------------
  // Stub backend wire-up — TranslationWatcher subscribes to translation diffs
  // for the active lang+namespace tuple. Returns a noop unsub today; once
  // backend ships an i18n stream, fill in subscribeTranslations.
  i18n = {
    subscribeTranslations: (_filter, _cb) => {
      void _filter; void _cb
      // TODO[sdk-i18n-stream]: dispatch through socket/SSE once backend ships.
      return () => {}
    },
  }

  // ────────────────────────────────────────────────────────────────────────
  // Realtime — pluggable provider. The SDK's realtime API is stable; the
  // transport (Supabase realtime today, socket.io/SSE in the future) is
  // injected at boot via `setRealtimeProvider`. That keeps consumers
  // (`fetch: { from: 'workspaceProject.realtime.messages', method: 'subscribe' }`)
  // unchanged when transport flips.
  //
  // Provider contract:
  //   provider({ op, filter, callback }) → unsubscribe
  // Where:
  //   op       — 'chat.messages' | 'chat.channels' | 'chat.mentions' |
  //              'tickets' | 'notifications' | 'presence' |
  //              'meet' | 'agentMessages'
  //   filter   — op-specific args (e.g. { channelId }, { userEmail }, { roomId })
  //   callback — fired on each event with (eventType, payload). Shape mirrors
  //              Supabase postgres_changes payload for backwards compat.
  //
  // Without a provider every subscribe returns a noop unsubscribe — same as
  // before — so call sites that subscribe defensively (no live data, but no
  // crash) keep working.
  // ────────────────────────────────────────────────────────────────────────

  setRealtimeProvider (fn) {
    this._realtimeProvider = typeof fn === 'function' ? fn : null
  }

  _realtimeSubscribe (op, filter, callback) {
    const p = this._realtimeProvider
    if (typeof p !== 'function' || typeof callback !== 'function') return () => {}
    try {
      const unsub = p({ op, filter: filter || {}, callback })
      return typeof unsub === 'function' ? unsub : (() => {})
    } catch (err) {
      // Don't crash callers on provider errors — log + return noop.
      // eslint-disable-next-line no-console
      console.warn(`[sdk.workspaceProject.realtime] provider failed for op '${op}':`, err?.message || err)
      return () => {}
    }
  }

  realtime = {
    // chat_messages — fired on INSERT/UPDATE in a channel.
    subscribeMessages: ({ channelId } = {}, cb) =>
      this._realtimeSubscribe('chat.messages', { channelId }, cb),
    // chat_channels + chat_channel_members combined feed (rename, archive,
    // membership). callback receives ('INSERT'|'UPDATE'|'DELETE', payload).
    subscribeChannels: (filter = {}, cb) =>
      this._realtimeSubscribe('chat.channels', filter, cb),
    // chat_mentions — fired on @-mention insert addressed to userEmail.
    subscribeMentions: ({ userEmail } = {}, cb) =>
      this._realtimeSubscribe('chat.mentions', { userEmail }, cb),
    // tickets — fired on ticket INSERT/UPDATE within the active workspace.
    subscribeTickets: (filter = {}, cb) =>
      this._realtimeSubscribe('tickets', filter, cb),
    // notifications — fired on notification INSERT for the caller.
    subscribeNotifications: ({ userEmail } = {}, cb) =>
      this._realtimeSubscribe('notifications', { userEmail }, cb),
    // presence — multi-user presence tracker; cb receives ('sync'|'join'|'leave', state).
    subscribePresence: ({ scope = 'workspace', userKey } = {}, cb) =>
      this._realtimeSubscribe('presence', { scope, userKey }, cb),
    // meet_rooms / meet_participants / meet_waiting_room combined feed for a
    // single room. cb receives ('room'|'participant'|'waiting', payload).
    subscribeMeet: ({ roomId } = {}, cb) =>
      this._realtimeSubscribe('meet', { roomId }, cb),
    // agent_messages — fired on INSERT addressed to `toAgent`. Used by the
    // walkie-talkie ops layer (Simona/Chuvaka).
    subscribeAgentMessages: ({ toAgent } = {}, cb) =>
      this._realtimeSubscribe('agentMessages', { toAgent }, cb),
  }

  // --- Storage (workspace-tenant buckets: contracts, chat-attachments, …) ---
  // Replaces direct `sb().storage.from(bucket).upload/createSignedUrl` calls
  // in the workspace UI. The workspace wrapper at /workspace/storage/* is the
  // authority on bucket access — RLS for storage moved server-side, so the
  // frontend never sees the underlying bucket service-role key.
  //
  // Three-arg signed-URL: bucket + path + ttl (seconds). Default TTL 5 min
  // matches the legacy `sb.storage.from('contracts').createSignedUrl(path, 300)`
  // call site in MemberProfile so callers don't need to pass it explicitly.
  storage = {
    createSignedUrl: (bucket, path, ttl = 300) =>
      this._ws('storage.createSignedUrl',
        `/storage/${encodeURIComponent(bucket)}/signed-url`, {
          method: 'POST',
          body: { path, ttl },
        }),
    // multipart upload — body must be a FormData carrying { file, path? }.
    // The wrapper extracts `file` and forwards to the storage backend.
    upload: (bucket, formData, options = {}) => {
      // Bypass the JSON-body branch in `_ws` by composing the request here.
      const _doUpload = async () => {
        this._requireReady('storage.upload')
        const url = `${this._workspacePrefix}/storage/${encodeURIComponent(bucket)}/upload`
        const init = { method: 'POST', body: formData, headers: {} }
        const auth = await this._resolveAuthHeader()
        if (auth) init.headers.Authorization = auth
        // Don't set Content-Type — browser sets multipart boundary itself.
        const res = await fetch(url, init)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
        return json
      }
      return _doUpload()
    },
    remove: (bucket, path) =>
      this._ws('storage.remove',
        `/storage/${encodeURIComponent(bucket)}/object`, {
          method: 'DELETE',
          body: { path },
        }),
    // Public download URL for a stored object — wraps the wrapper's signed
    // GET endpoint so callers don't need the bucket service-role key.
    publicUrl: (bucket, path) =>
      this._ws('storage.publicUrl',
        `/storage/${encodeURIComponent(bucket)}/public-url`, {
          method: 'POST',
          body: { path },
        }),
  }

  // --- Generic escape hatch ---------------------------------------------------
  query = (body) => this._ws('query', '/query', { method: 'POST', body })
}
