// BaseService is the shared service base class in @symbo.ls/sdk. We use a
// monorepo-relative import (NOT `from '@symbo.ls/sdk'`) on purpose:
//   - At dev time the path resolves directly to the source file, so there
//     is no circular-dep boot order trap (SDK → this package → SDK …).
//   - At publish time esbuild follows the path and inlines BaseService
//     into this package's dist, so the published artifact is
//     self-contained and consumers don't pay a runtime cycle either.
//   - BaseService is small (~160 lines); duplicating it across two
//     packages' dists is cheaper than coordinating a third
//     `@symbo.ls/sdk-core` shared package and is acceptable for the
//     bundle-size budget (browser consumers tree-shake the duplicate).
import { BaseService } from '../../../src/services/BaseService.js'

const WORKSPACE_PROJECT_PREFIX = '/workspace-project'

// Compose a workspace-project base URL given an api base. Public so any
// consumer that needs the full `${apiBase}/workspace-project` URL (e.g.
// the Supabase passthrough adapter) reads it from the SDK rather than
// hard-coding the literal.
export const workspaceProjectBaseUrl = (apiBase) =>
  `${apiBase}${WORKSPACE_PROJECT_PREFIX}`

// Calls the workspace-project wrapper at next.api.symbols.app/workspace-project/*
// (or ${apiUrl}/workspace-project/* in dev/staging). Built on top of
// @symbo-ls/server-workspace-project.
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
export class WorkspaceProjectService extends BaseService {
  init({ context }) {
    super.init({ context })
    this._workspacePrefix = workspaceProjectBaseUrl(context?.workspaceApiUrl || this._apiUrl)
    this._tokenProvider = context?.workspaceProjectTokenProvider || null
  }

  async _resolveAuthHeader() {
    if (this._tokenProvider) {
      try {
        const result = await this._tokenProvider()
        // Only short-circuit when the provider produced a usable token.
        // A null/empty result means the federated path isn't ready (e.g.
        // governance Supabase JWT missing, sdk_only diagnostic) — in that
        // case fall through to _tokenManager so the SDK Mongo token still
        // authenticates the request via the wrapper's userResolver path.
        // Returning null here would send the request with no Authorization
        // header and 401 the user, even though they have a perfectly valid
        // session token.
        if (result) {
          if (typeof result === 'string') return `Bearer ${result}`
          if (result.token) return `Bearer ${result.token}`
          if (result.access_token) return `Bearer ${result.access_token}`
        }
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
    const init = { method, headers: { ...(headers || {}) }, methodName }
    if (body !== undefined) init.body = JSON.stringify(body)
    init.authHeader = await this._resolveAuthHeader()
    // Architectural gate: workspace-project routes ALWAYS require a
    // bearer token (the wrapper's authenticate() rejects anonymous
    // requests with 401 `missing bearer token` — there's no public
    // surface here). When neither the federated tokenProvider NOR the
    // SDK TokenManager has one, firing the request is guaranteed to
    // produce a console 401 with no useful information. Surface a
    // structured "not authenticated" rejection instead so callers can
    // wait for auth to land, render an empty state, or retry — same
    // shape as the wrapper's `invalid_token` envelope so error-handling
    // doesn't have to branch on local-vs-server origin.
    if (!init.authHeader) {
      const err = new Error('[workspaceProject] not authenticated — no bearer token available')
      err.code = 'invalid_token'
      err.status = 401
      err.local = true
      throw err
    }
    return this._requestExternal(url, init)
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
    // PostgREST treats `,()` as filter syntax. Wrap values containing those
    // characters in double quotes (PostgREST's documented escape) so caller
    // input can't subvert the operator parser. Embedded `"` are doubled.
    const _enc = (v) => {
      if (v === null) return 'null'
      const s = String(v)
      if (/[,()"\s]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const _validKey = (k) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(k)
    const _appendKey = (key, value) => {
      if (!_validKey(key)) {
        throw new Error(`[${methodName}] invalid filter key: ${key}`)
      }
      qs.append(key, value)
    }

    if (filter && typeof filter === 'object') {
      for (const [rawKey, val] of Object.entries(filter)) {
        if (val === undefined) continue
        // <key>_in: [a,b,c] convenience — translate to in.()
        if (rawKey.endsWith('_in') && Array.isArray(val)) {
          _appendKey(rawKey.slice(0, -3), `in.(${val.map(_enc).join(',')})`)
          continue
        }
        if (val === null) {
          _appendKey(rawKey, 'is.null')
        } else if (Array.isArray(val)) {
          _appendKey(rawKey, `in.(${val.map(_enc).join(',')})`)
        } else if (typeof val === 'object') {
          // Operator form: { gte, lte, gt, lt, eq, neq, like, ilike, is }
          for (const [opName, opVal] of Object.entries(val)) {
            if (!/^[a-z]+$/.test(opName)) {
              throw new Error(`[${methodName}] invalid filter operator: ${opName}`)
            }
            _appendKey(rawKey, `${opName}.${_enc(opVal)}`)
          }
        } else {
          _appendKey(rawKey, `eq.${_enc(val)}`)
        }
      }
    }
    if ((op === 'get' || op === 'update' || op === 'remove') && idValue !== undefined && !qs.has('id')) {
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

    if (op === 'create' || op === 'update' || op === 'rpc') {
      init.body = JSON.stringify(payload ?? {})
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

    init.methodName = methodName
    init.authHeader = await this._resolveAuthHeader()
    return this._requestExternal(url, init)
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

    listMessages: (channelId, options) => {
      const qs = options && typeof options === 'object'
        ? new URLSearchParams(
            Object.entries(options).reduce((acc, [k, v]) => {
              if (v !== undefined && v !== null) acc[k] = String(v)
              return acc
            }, {})
          ).toString()
        : ''
      const tail = qs ? `?${qs}` : ''
      return channelId
        ? this._ws('chat.listMessages', `/chat/channels/${encodeURIComponent(channelId)}/messages${tail}`)
        : this._ws('chat.listAllMessages', `/chat/messages${tail}`)
    },
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
      channelId
        ? this._ws('chat.listMembers', `/chat/channels/${encodeURIComponent(channelId)}/members`)
        : this._ws('chat.listAllMembers', '/chat/members'),
    addMember: (channelId, payload) =>
      this._ws('chat.addMember', '/chat/members', {
        method: 'POST',
        body: { payload: { ...payload, channel_id: channelId } },
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
    // PostgREST upsert via workspace passthrough — caller picks the
    // on_conflict column list (default 'id'). Google-sync writers pass
    // 'google_calendar_id,google_event_id' so re-pulls don't duplicate.
    upsertEvent: (payload, onConflict) =>
      this._sb('calendar.upsertEvent', 'calendar_events', 'create', {
        payload,
        options: { upsertOnConflict: onConflict || 'id' },
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
    // #2226 — owner remote-mutes a participant's published audio. Routes
    // through the worker → meet-mute edge fn → LiveKit
    // RoomServiceClient.mutePublishedTrack. params: { roomId,
    // participantIdentity, trackSid, muted }.
    mute: (params) =>
      this._ws('meet.mute', '/meet/mute', { method: 'POST', body: { params } }),
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

  // Documents alias dropped — canonical surfaces are:
  //   sdk.docs.{list,get,create,update,remove}
  //   sdk.docs.{documents,kbArticles,notes,userDocs}.* — type-specific sugar
  //   sdk.resourceLinks.{list,create,remove,removeByPair}
  // workspace-project Supabase docs wrappers are gone; no back-compat alias.

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
  fileCanvas    = this._sbCrud('file_canvas')

  // --- Analyzed (observability) ----------------------------------------------
  // Replaces Grafana Faro for symbo.ls apps. Browser → workspace-project
  // worker → analyzed_* tables — no separate analyzed Cloudflare worker.
  //
  // Writes: `ingest` POSTs to /workspace-project/analyzed/ingest. The wrapper
  // server-stamps workspace_id from the caller's JWT so clients can't lie
  // about which workspace the telemetry belongs to.
  //
  // Reads: PostgREST passthrough at /workspace-project/sb/rest/v1/*. RLS
  // (0114_analyzed_rls.sql) gates rows by app_metadata.workspace_id from
  // the minted Supabase JWT, so reads see only the active workspace.
  //
  // Bug clustering uses an RPC (0115_analyzed_rpc.sql) because PostgREST
  // has no native grouping.
  analyzed = {
    // Browser SDK ships its batched envelope through here. Body shape is
    // documented at server/workers/workspace-project/src/surfaces/analyzed.js.
    ingest: (envelope) =>
      this._ws('analyzed.ingest', '/analyzed/ingest', { method: 'POST', body: envelope }),

    listSessions: (filter, options) =>
      this._sb('analyzed.listSessions', 'analyzed_session_summaries', 'list',
        { filter, options: { order: 'started_at.desc', limit: 100, ...(options || {}) } }),

    getSession: (id) =>
      this._sb('analyzed.getSession', 'analyzed_session_summaries', 'list',
        { filter: { id }, options: { single: true } }),

    listEvents: (filter, options) =>
      this._sb('analyzed.listEvents', 'analyzed_events', 'list',
        { filter, options: { order: 'ts.asc', limit: 500, ...(options || {}) } }),

    // Per-user aggregate view (server@9d207d98 migration 0133) — one row
    // per (workspace_id, project_id, user_id). Backs the by-user paginated
    // /logs view (WORKSPACE-LOGS-USERS-PAGINATED).
    listUsers: (filter, options) =>
      this._sb('analyzed.listUsers', 'analyzed_user_summaries', 'list',
        { filter, options: { order: 'last_seen.desc', limit: 20, ...(options || {}) } }),

    clusters: ({ workspaceId, appKey, since, limit = 200, offset = 0 } = {}) =>
      this._sb('analyzed.clusters', 'fn_analyzed_bug_clusters', 'rpc',
        { payload: { p_workspace: workspaceId, p_app_key: appKey || null, p_since: since || null, p_max_rows: limit, p_offset: offset } }),
  }

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
    // Singleton table — exactly one row per workspace, RLS-scoped by tenant.
    // We resolve the live id at call time rather than hardcoding `1`, so a
    // brief multi-row state (failed migration, manual seed) doesn't silently
    // overwrite row #1; first call after a fresh tenant init INSERTs.
    update: async (payload) => {
      const current = await this._sb(
        'companySettings.update.fetch',
        'company_settings',
        'list',
        { options: { limit: 1 } }
      )
      const row = Array.isArray(current) ? current[0] : current
      if (!row?.id) {
        return this._sb(
          'companySettings.update.insert',
          'company_settings',
          'create',
          { payload }
        )
      }
      return this._sb(
        'companySettings.update',
        'company_settings',
        'update',
        { id: row.id, payload }
      )
    },
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
      // SDK-WORKSPACE-STANDUPS-UPSERT-WRONG-CONFLICT-COL — table is keyed
      // on `(author, date)` per migration 0033_standup_activity.sql:13-25.
      // The legacy `author_email` token caused PostgREST to reject every
      // upsert with `column "author_email" does not exist` (/logs id=77428).
      this._sb('standups.upsert', 'standup_activity', 'create',
        { payload, options: { upsertOnConflict: 'author,date' } }),
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

  // --- AI surface retired 2026-05-20 -----------------------------------------
  // Both ai.chat and ai.meetAnalyze moved off Supabase. All AI inference
  // now lives on the main server at /core/ai-chat/*. Use:
  //   sdk.aiChat.completion(payload)
  //   sdk.aiChat.stream(payload, callbacks)
  //   sdk.aiChat.meetAnalyze({ roomId, force })
  // See sdk/src/services/AiChatService.js.

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

  // --- Community feed + follow graph ----------------------------------------
  // Backed by migration 0106_community_feed.sql. Tables are public-readable
  // (the feed is a global / cross-tenant social surface) and writes are
  // RLS-scoped to the caller's email — `auth.email() = author_email`.
  //
  // Each surface is a thin _sb() wrapper rather than _sbCrud so we can pin
  // the default ordering (recent posts / oldest comments first) without
  // every caller passing it.
  feed = {
    list: (filter, options) =>
      this._sb('feed.list', 'feed_posts', 'list', {
        filter,
        options: { order: 'created_at.desc', limit: 50, ...(options || {}) },
      }),
    get: (id) => this._sb('feed.get', 'feed_posts', 'get', { id }),
    create: (payload) =>
      this._sb('feed.create', 'feed_posts', 'create', { payload }),
    update: (id, payload) =>
      this._sb('feed.update', 'feed_posts', 'update', { id, payload }),
    remove: (id) => this._sb('feed.remove', 'feed_posts', 'remove', { id }),

    likes: {
      list: (postId) =>
        this._sb('feed.likes.list', 'feed_post_likes', 'list',
          { filter: { post_id: postId } }),
      create: (postId, userEmail) =>
        this._sb('feed.likes.create', 'feed_post_likes', 'create',
          { payload: { post_id: postId, user_email: userEmail } }),
      remove: (id) =>
        this._sb('feed.likes.remove', 'feed_post_likes', 'remove', { id }),
    },

    comments: {
      list: (postId, options) =>
        this._sb('feed.comments.list', 'feed_post_comments', 'list', {
          filter: { post_id: postId },
          options: { order: 'created_at.asc', ...(options || {}) },
        }),
      create: (postId, payload) =>
        this._sb('feed.comments.create', 'feed_post_comments', 'create',
          { payload: { post_id: postId, ...(payload || {}) } }),
      update: (id, payload) =>
        this._sb('feed.comments.update', 'feed_post_comments', 'update',
          { id, payload }),
      remove: (id) =>
        this._sb('feed.comments.remove', 'feed_post_comments', 'remove', { id }),
    },
  }

  follows = {
    list: (filter, options) =>
      this._sb('follows.list', 'user_follows', 'list', {
        filter,
        options: { order: 'created_at.desc', ...(options || {}) },
      }),
    create: (followerEmail, followeeEmail) =>
      this._sb('follows.create', 'user_follows', 'create', {
        payload: { follower_email: followerEmail, followee_email: followeeEmail },
      }),
    remove: (id) => this._sb('follows.remove', 'user_follows', 'remove', { id }),
    // Convenience helper — many UIs only have the (follower, followee) tuple
    // and would otherwise have to do a list+find before remove.
    removeByPair: async (followerEmail, followeeEmail) => {
      const rows = await this._sb('follows.removeByPair.find', 'user_follows', 'list', {
        filter: { follower_email: followerEmail, followee_email: followeeEmail },
        options: { limit: 1 },
      })
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) return null
      return this._sb('follows.removeByPair.remove', 'user_follows', 'remove',
        { id: row.id })
    },
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
    // notifications — fired on notification INSERT for the caller.
    subscribeNotifications: ({ userEmail } = {}, cb) =>
      this._realtimeSubscribe('notifications', { userEmail }, cb),
    // presence — multi-user presence tracker; cb receives ('sync'|'join'|'leave', state).
    subscribePresence: ({ scope = 'workspace', userKey } = {}, cb) =>
      this._realtimeSubscribe('presence', { scope, userKey }, cb),
    // meet_rooms / meet_participants / meet_waiting_room combined feed for a
    // single room. cb receives ('room'|'participant'|'waiting', payload).
    //
    // Transport-agnostic: delegates to the injected realtime provider, which
    // picks Supabase postgres_changes or the server SSE stream based on the
    // MEET_REALTIME flag (spec §4.3). Both transports honor the SAME
    // (kind, payload) + snake_case `{eventType,new,old}` contract, so the
    // consumer (`subscribeMeetRealtime.js`) is byte-unchanged.
    subscribeMeet: ({ roomId, workspaceId, tables } = {}, cb) =>
      this._realtimeSubscribe('meet', { roomId, workspaceId, tables }, cb),

    // Server-SSE meet subscription (spec §4 — the SSE transport behind
    // MEET_REALTIME=sse|both). Reuses the proven tickets `_sseSubscribe`
    // EventSource client (query-param auth, exp-backoff reconnect) and
    // re-frames the server's `meet.<kind>.<verb>` event envelope back into the
    // legacy `(kind, payload)` callback the Supabase path emitted — so the
    // consumer stays unchanged.
    //
    // The server stream (GET /core/meet/stream) already serializes rows in the
    // PostgREST wire shape and sends `data: { eventType, new, old }` (snake_case
    // columns), so each re-framer is a thin event-NAME → kind map; the payload
    // passes through verbatim. `participant` is intentionally absent from the
    // map (D6 — never emitted by the server); the consumer's `participant`
    // branch stays dead code, unchanged.
    subscribeMeetSse: ({ roomId, workspaceId, tables } = {}, cb) => {
      if (typeof cb !== 'function') return () => {}

      // (kind, payload) adapter: each event frame returns { kind, payload };
      // a frame returning undefined is swallowed (snapshot/revoked have no
      // consumer branch — the page's own fetch reconciles).
      const deliver = (framed) => {
        if (!framed || !framed.kind) return
        try { cb(framed.kind, framed.payload) } catch (_) { /* listener errors don't propagate */ }
      }

      // The server `data` is ALREADY `{ eventType, new, old }`; pass it
      // through as the payload so the consumer's payload.new/.old/.eventType
      // reads land unchanged. eventType is also recomputed defensively from
      // the SSE event name when the server omits it.
      const passthrough = (kind) => (data) => ({ kind, payload: data })

      const events = [
        // snapshot drives a refetch on the consumer; it has no `snapshot`
        // branch, so swallow and let the page's own initial fetch populate.
        { name: 'meet.snapshot', frame: () => undefined },
        { name: 'meet.room.insert', frame: passthrough('room') },
        { name: 'meet.room.update', frame: passthrough('room') },
        { name: 'meet.room.delete', frame: passthrough('room') },
        { name: 'meet.waiting.insert', frame: passthrough('waiting') },
        { name: 'meet.waiting.update', frame: passthrough('waiting') },
        { name: 'meet.waiting.delete', frame: passthrough('waiting') },
        // transcripts are INSERT-only (immutable utterances).
        { name: 'meet.transcript.insert', frame: passthrough('transcript') },
        { name: 'meet.analysis.insert', frame: passthrough('analysis') },
        { name: 'meet.analysis.update', frame: passthrough('analysis') },
        // access lost mid-stream (visibility flip / membership revoke): the
        // server stops emitting; the consumer reconciles to empty on next
        // fetch. No consumer branch — swallow.
        { name: 'meet.revoked', frame: () => undefined }
      ]

      // tables CSV — the server reads a flat `?tables=…` query param (NOT
      // `filter[tables]`), so serialize FLAT. Only forward defined scope keys.
      const filter = {}
      if (roomId) filter.roomId = roomId
      if (workspaceId && !roomId) filter.workspaceId = workspaceId
      if (Array.isArray(tables) && tables.length) filter.tables = tables.join(',')
      else if (typeof tables === 'string' && tables) filter.tables = tables

      return this._sseSubscribe('/meet/stream', filter, deliver, { events, flatParams: true })
    },
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
