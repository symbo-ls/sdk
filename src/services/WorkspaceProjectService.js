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
import { BaseService } from './BaseService.js'

const WORKSPACE_PROJECT_PREFIX = '/workspace-project'

// Decode a JWT payload without verifying the signature, mirroring
// TokenManager._decodeJwtExpMs's base64url→JSON pattern (sdk/src/utils/
// TokenManager.js) but pulling the workspace claim instead of `exp`. Used by
// `_resolveAuthHeader`'s staleness guard below. Precedence matches the
// server's own extraction (server/workers/workspace-project/src/auth.js
// `claimsToScope`): top-level `workspace_id`/`workspaceId` first, then
// `app_metadata.workspace_id` / `app_metadata.active_workspace_id`.
//
// Returns `null` for anything that isn't a 3-part JWT, fails to parse, or
// carries no workspace claim — callers MUST treat `null` as "unknown", not
// "no workspace", so an opaque/undecodable token never gets treated as
// stale.
const _decodeJwtWorkspaceId = (token) => {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (payload.length % 4) payload += '='
    const json =
      typeof atob === 'function'
        ? atob(payload)
        : Buffer.from(payload, 'base64').toString('utf8')
    const claims = JSON.parse(json)
    const appMeta = claims?.app_metadata || {}
    return (
      claims?.workspace_id ??
      claims?.workspaceId ??
      appMeta.workspace_id ??
      appMeta.active_workspace_id ??
      null
    )
  } catch {
    return null
  }
}

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
    this._workspacePrefix = workspaceProjectBaseUrl(
      context?.workspaceApiUrl || this._apiUrl
    )
    this._tokenProvider = context?.workspaceProjectTokenProvider || null
  }

  async _resolveAuthHeader() {
    if (this._tokenProvider) {
      try {
        const result = await this._tokenProvider()
        // Only short-circuit when the provider produced a usable token.
        // The federated token path is retired, so a null/empty result is now
        // the norm — fall through to _tokenManager, which supplies the SDK
        // Mongo token that authenticates the request via the wrapper's
        // userResolver path (the sole, authoritative token source now).
        // Returning null here would send the request with no Authorization
        // header and 401 the user, even though they have a perfectly valid
        // session token.
        const federatedToken = result
          ? typeof result === 'string'
            ? result
            : result.token || result.access_token || null
          : null
        if (federatedToken) {
          // Workspace-scoping guard ("workspace-scoping gaps in the chat
          // transport" ticket, 2026-07-13): a cached/localStorage federated
          // JWT can outlive a `switchOrg`/`switchWorkspace` call — it keeps
          // the OLD workspace claim until the background re-mint lands,
          // which can stall indefinitely while the federation Supabase
          // plane is paused (current dev/local reality). The SDK's own
          // `activeWorkspaceId` is updated SYNCHRONOUSLY by
          // sdk.switchOrg/switchWorkspace (see index.js), so it's the
          // freshest signal available. When it disagrees with the JWT's
          // decoded workspace claim, the Mongo access token (scoped via
          // Mongo `User.activeOrganization`/`activeWorkspace`, never
          // stale) is more trustworthy — prefer it. An undecodable JWT or
          // an unset activeWorkspaceId is "unknown" (not "stale") and
          // keeps the historical precedence (federated JWT wins).
          const activeWorkspaceId = this._context?.activeWorkspaceId
          const claimedWorkspaceId = _decodeJwtWorkspaceId(federatedToken)
          const staleWorkspaceClaim =
            activeWorkspaceId != null &&
            claimedWorkspaceId != null &&
            String(claimedWorkspaceId) !== String(activeWorkspaceId)
          if (!staleWorkspaceClaim) return `Bearer ${federatedToken}`
          // Stale — try the Mongo token first, but fall back to the stale
          // federated JWT if the TokenManager can't produce one, so we
          // still send SOME auth header rather than 401ing a user with a
          // valid (if momentarily mis-scoped) session.
          if (this._tokenManager) {
            try {
              await this._tokenManager.ensureValidToken()
              const mongoHeader = this._tokenManager.getAuthHeader()
              if (mongoHeader) return mongoHeader
            } catch {}
          }
          return `Bearer ${federatedToken}`
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

  // switchOrg/switchWorkspace hooks — sdk.switchOrg/switchWorkspace
  // (sdk/src/index.js) walk every service that implements these after
  // updating `_context.activeWorkspaceId`. Best-effort invalidate any
  // cache the token provider keeps internally (e.g. the workspace app's
  // workspaceTokenProvider 30s localStorage cache) so the NEXT
  // `_resolveAuthHeader()` call re-reads a fresh federated JWT instead of
  // serving a stale one for up to the cache TTL. Providers opt in by
  // attaching an `.invalidate()` method to the function passed as
  // `context.workspaceProjectTokenProvider`; providers that don't expose
  // one are unaffected — the staleness guard in `_resolveAuthHeader` above
  // is the primary defense either way, this is just belt-and-suspenders.
  switchOrg() {
    this._invalidateTokenProviderCache()
  }

  switchWorkspace() {
    this._invalidateTokenProviderCache()
  }

  _invalidateTokenProviderCache() {
    try {
      if (typeof this._tokenProvider?.invalidate === 'function') {
        this._tokenProvider.invalidate()
      }
    } catch {}
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
      const err = new Error(
        '[workspaceProject] not authenticated — no bearer token available'
      )
      err.code = 'invalid_token'
      err.status = 401
      err.local = true
      throw err
    }
    return this._requestExternal(url, init)
  }

  // The `/sb` PostgREST passthrough (`_sb()`) is REMOVED. It routed arbitrary
  // workspace-tenant tables through /workspace/sb/rest/v1/* so a table could be
  // exposed on the SDK without a curated server route. Every table it served
  // now has one:
  //   file_canvas      → /core/file-canvas/*
  //   standup_activity → /core/workspaces/:id/standups
  //   activity_events  → /core/workspaces/:id/activity-log
  //   user_profiles    → /core/user-profile
  //   (announcements, workspace_records, prefs, … moved earlier)
  //
  // Do not reintroduce it. Its convenience was the problem: a table could join
  // the passthrough in one line and then keep it alive indefinitely with no
  // visible owner — which is exactly how file_canvas outlived its own /core
  // route by three weeks.

  // _sbCrud(table) — the generic PostgREST CRUD factory — is REMOVED, and so is
  // the `/sb` proxy it fed (deleted from the worker in server 17ff789a). EVERY
  // namespace in this file now addresses either a `/core/*` route or one of the
  // worker's own CURATED `/workspace-project/*` handlers.
  //
  // Do not reintroduce either helper. Their convenience was the failure mode: a
  // table joined the passthrough in one line and then kept it alive with no
  // visible owner. See noSupabasePassthrough.test.js, which fails if they come
  // back.

  // Resolve the workspaceId a chat READ should scope to — thin wrapper over
  // BaseService._resolveWorkspaceId (shared with AiChatService, TicketService,
  // AiService; see tickets/sdk.md "hoist a BaseService tenant-scope
  // defaulter"): an explicit caller-supplied value wins; otherwise falls
  // back to the SDK's own `activeWorkspaceId` context (kept fresh by
  // sdk.switchOrg/switchWorkspace — see the staleness guard in
  // `_resolveAuthHeader` above). The server-side wrapper still authorizes
  // off the bearer token; this query param additionally lets it enforce
  // the caller's chosen tenant instead of trusting whichever workspace the
  // (possibly stale) federated JWT claims. Returns `undefined` when
  // neither source has a value, so callers can omit the param entirely.
  // (Named for its chat origin; since the SERVER-CHAT-WS-SCOPE-EXPLICIT
  // sweep it is the generic workspace-scope resolver for every surface.)
  _chatWorkspaceId(workspaceId) {
    return this._resolveWorkspaceId(workspaceId)
  }

  // --- Chat -------------------------------------------------------------------
  chat = {
    // workspaceId is optional — defaults to `this._context.activeWorkspaceId`
    // via `_chatWorkspaceId` (see "workspace-scoping gaps in the chat
    // transport" ticket, 2026-07-13).
    listChannels: (workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('chat.listChannels', `/chat/channels${qs}`)
    },
    // Stamp the caller's chosen workspace into the create payload (explicit
    // `payload.workspace_id` wins; falls back to the SDK's activeWorkspaceId
    // via `_chatWorkspaceId`, same resolution as listChannels). The server
    // validates membership and scopes the create to it (SERVER-CHAT-WS-
    // SCOPE-EXPLICIT) instead of trusting the possibly-stale token claim.
    createChannel: (payload) => {
      const wsId = this._chatWorkspaceId(payload?.workspace_id)
      return this._ws('chat.createChannel', '/chat/channels', {
        method: 'POST',
        body: { payload: wsId ? { ...payload, workspace_id: wsId } : payload }
      })
    },
    updateChannel: (channelId, payload) =>
      this._ws(
        'chat.updateChannel',
        `/chat/channels/${encodeURIComponent(channelId)}`,
        {
          method: 'PATCH',
          body: { payload }
        }
      ),
    removeChannel: (channelId) =>
      this._ws(
        'chat.removeChannel',
        `/chat/channels/${encodeURIComponent(channelId)}`,
        {
          method: 'DELETE'
        }
      ),

    // No silent channel→workspace read escalation: a falsy `channelId`
    // ONLY routes to the workspace-wide bulk dump when the caller passes
    // `{ bulk: true }` explicitly. The declarative entity-dispatch route
    // (EntityDispatcher.js `workspaceProject.chat.messages`) sets `bulk`
    // for its callers so `sdk.execute(..., 'list', {})` (no channelId)
    // keeps working byte-identically; direct `svc.chat.listMessages()`
    // callers must opt in.
    listMessages: (channelId, options) => {
      const { bulk, workspaceId, ...queryOptions } =
        options && typeof options === 'object' ? options : {}
      if (!channelId && bulk !== true) {
        throw new Error(
          '[chat.listMessages] channelId is required — pass { bulk: true } explicitly for a workspace-wide read'
        )
      }
      const params = Object.entries(queryOptions).reduce((acc, [k, v]) => {
        if (v !== undefined && v !== null) acc[k] = String(v)
        return acc
      }, {})
      const wsId = this._chatWorkspaceId(workspaceId)
      if (wsId) params.workspaceId = String(wsId)
      const qs = new URLSearchParams(params).toString()
      const tail = qs ? `?${qs}` : ''
      return channelId
        ? this._ws(
            'chat.listMessages',
            `/chat/channels/${encodeURIComponent(channelId)}/messages${tail}`
          )
        : this._ws('chat.listAllMessages', `/chat/messages${tail}`)
    },
    sendMessage: (channelId, payload) =>
      this._ws(
        'chat.sendMessage',
        `/chat/channels/${encodeURIComponent(channelId)}/messages`,
        {
          method: 'POST',
          body: { payload }
        }
      ),
    updateMessage: (messageId, payload) =>
      this._ws(
        'chat.updateMessage',
        `/chat/messages/${encodeURIComponent(messageId)}`,
        {
          method: 'PATCH',
          body: { payload }
        }
      ),
    removeMessage: (messageId) =>
      this._ws(
        'chat.removeMessage',
        `/chat/messages/${encodeURIComponent(messageId)}`,
        {
          method: 'DELETE'
        }
      ),
    // Org-admin-only bulk purge of EVERY message in the caller's ACTIVE
    // workspace. Takes no args — the worker route (POST /chat/messages/purge)
    // derives the workspace from the bearer token and enforces the admin gate
    // (auth.isSuperadmin) + workspace scoping server-side. Replaces the
    // danger-zone page's raw, unscoped, client-side DELETE against
    // chat_messages with the anon key.
    purgeMessages: () =>
      this._ws('chat.purgeMessages', '/chat/messages/purge', {
        method: 'POST'
      }),
    toggleReaction: (messageId, emoji, userId) =>
      this._ws(
        'chat.toggleReaction',
        `/chat/messages/${encodeURIComponent(messageId)}/reactions`,
        {
          method: 'POST',
          body: { emoji, userId }
        }
      ),

    // No silent channel→workspace read escalation — see listMessages above;
    // same `{ bulk: true }` contract.
    listMembers: (channelId, options) => {
      const { bulk, workspaceId } =
        options && typeof options === 'object' ? options : {}
      if (!channelId && bulk !== true) {
        throw new Error(
          '[chat.listMembers] channelId is required — pass { bulk: true } explicitly for a workspace-wide read'
        )
      }
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return channelId
        ? this._ws(
            'chat.listMembers',
            `/chat/channels/${encodeURIComponent(channelId)}/members${qs}`
          )
        : this._ws('chat.listAllMembers', `/chat/members${qs}`)
    },
    addMember: (channelId, payload) =>
      this._ws('chat.addMember', '/chat/members', {
        method: 'POST',
        body: { payload: { ...payload, channel_id: channelId } }
      }),
    updateMember: (channelId, userId, payload) =>
      this._ws(
        'chat.updateMember',
        `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: { payload }
        }
      ),
    removeMember: (channelId, userId) =>
      this._ws(
        'chat.removeMember',
        `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE'
        }
      ),
    markRead: (channelId, userId, lastReadAt) =>
      this._ws(
        'chat.markRead',
        `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}/read`,
        {
          method: 'POST',
          body: { lastReadAt }
        }
      ),
    muteChannel: (channelId, userId, muted) =>
      this._ws(
        'chat.muteChannel',
        `/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}/mute`,
        {
          method: 'POST',
          body: { muted }
        }
      ),

    // workspaceId (options.workspaceId, defaulting to activeWorkspaceId) is
    // sent as a query param — NOT folded into the POST body — so the
    // server can enforce it the same way as the GET-based chat reads
    // above, independent of the filter/options body shape.
    listMentions: (filter, options) => {
      const hasOptions = !!(options && typeof options === 'object')
      const { workspaceId, ...restOptions } = hasOptions ? options : {}
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('chat.listMentions', `/chat/mentions${qs}`, {
        method: 'POST',
        body: { filter, options: hasOptions ? restOptions : options }
      })
    },
    // Mark every chat_mention for the caller in a channel as read. Wraps the
    // chat_mark_mentions_read SQL function — see migration 0015.
    markMentionsRead: (channelId, callerEmail) =>
      this._ws(
        'chat.markMentionsRead',
        `/chat/channels/${encodeURIComponent(channelId)}/mentions/read`,
        {
          method: 'POST',
          body: { callerEmail }
        }
      ),
    // Full-text search over messages in channels the caller belongs to.
    // Wraps the chat_search_messages SQL function — see migration 0014.
    // workspaceId (optional 3rd arg, defaulting to activeWorkspaceId) is
    // sent as a query param — same contract as listMentions above.
    searchMessages: (q, callerEmail, workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('chat.searchMessages', `/chat/search${qs}`, {
        method: 'POST',
        body: { q, callerEmail }
      })
    }
  }

  // --- Calendar ---------------------------------------------------------------
  calendar = {
    // workspaceId optional — defaults to the SDK's activeWorkspaceId; the
    // server membership-validates and scopes to it (fail-closed to the claim).
    listEvents: (filter, workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('calendar.listEvents', `/calendar/events${qs}`, {
        method: 'POST',
        body: { filter }
      })
    },
    getEvent: (id) =>
      this._ws(
        'calendar.getEvent',
        `/calendar/events/${encodeURIComponent(id)}`
      ),
    createEvent: (payload) => {
      const wsId = this._chatWorkspaceId(payload?.workspace_id)
      return this._ws('calendar.createEvent', '/calendar/events', {
        method: 'POST',
        body: { payload: wsId ? { ...payload, workspace_id: wsId } : payload }
      })
    },
    updateEvent: (id, payload) =>
      this._ws(
        'calendar.updateEvent',
        `/calendar/events/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: { payload }
        }
      ),
    deleteEvent: (id) =>
      this._ws(
        'calendar.deleteEvent',
        `/calendar/events/${encodeURIComponent(id)}`,
        {
          method: 'DELETE'
        }
      ),
    // upsertEvent removed 2026-07 — it was the last PostgREST-upsert path on
    // this namespace (dropped with the workspace-project Supabase org
    // retirement). Google-sync re-pull dedupe is handled server-side by the
    // /calendar/sync worker route.
    sync: (params) =>
      this._ws('calendar.sync', '/calendar/sync', {
        method: 'POST',
        body: { params }
      })
  }

  // --- Meet -------------------------------------------------------------------
  meet = {
    listRooms: (workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('meet.listRooms', `/meet/rooms${qs}`)
    },
    createRoom: (payload) => {
      const wsId = this._chatWorkspaceId(payload?.workspace_id)
      return this._ws('meet.createRoom', '/meet/rooms', {
        method: 'POST',
        body: { payload: wsId ? { ...payload, workspace_id: wsId } : payload }
      })
    },
    getRoom: (id) =>
      this._ws('meet.getRoom', `/meet/rooms/${encodeURIComponent(id)}`),
    // Update a meet_rooms row — name, privacy, guest-join policy, etc.
    // Replaces direct sb.from('meet_rooms').update(...).eq('id', id) calls
    // in updateRoomSettings.js. RLS policy meet_rooms_update gates this to
    // the room creator/admins.
    updateRoom: (id, payload) =>
      this._ws('meet.updateRoom', `/meet/rooms/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { payload }
      }),
    // Mark the room as ended (sets ended_at). Distinct PATCH ergonomically —
    // callers don't have to construct the timestamp; server stamps it.
    // Reopening a room flips ended_at back to null (see reopenRoom).
    endRoom: (id) =>
      this._ws('meet.endRoom', `/meet/rooms/${encodeURIComponent(id)}/end`, {
        method: 'POST'
      }),
    reopenRoom: (id) =>
      this._ws(
        'meet.reopenRoom',
        `/meet/rooms/${encodeURIComponent(id)}/reopen`,
        {
          method: 'POST'
        }
      ),
    listMembers: (id) =>
      this._ws(
        'meet.listMembers',
        `/meet/rooms/${encodeURIComponent(id)}/members`
      ),
    // Add a member row to a meet room. Replaces direct
    // sb.from('meet_room_members').insert(...) in createRoom.js — the
    // meet_members_insert RLS policy allows user_id = auth.uid() inserts
    // so self-join from a shared URL still works.
    addMember: (roomId, payload) =>
      this._ws(
        'meet.addMember',
        `/meet/rooms/${encodeURIComponent(roomId)}/members`,
        {
          method: 'POST',
          body: { payload }
        }
      ),
    listTranscripts: (id) =>
      this._ws(
        'meet.listTranscripts',
        `/meet/rooms/${encodeURIComponent(id)}/transcripts`
      ),
    // Raw transcribed utterances (was sb().from('meet_transcripts').select())
    // — individual speech segments, distinct from the higher-level
    // transcript analysis summaries returned by listTranscripts.
    listUtterances: (id) =>
      this._ws(
        'meet.listUtterances',
        `/meet/rooms/${encodeURIComponent(id)}/utterances`
      ),
    // Combined utterances + cached analysis — the shape the legacy
    // get_meet_transcript_view(uuid) Supabase RPC returned. The
    // workspaceProject.meet.transcriptView entity has mapped to
    // meet.getTranscriptView since the 2026-04-27 migration but the
    // method was NEVER implemented — sdk.execute threw "method not
    // found", the meet TranscriptPage fetch swallowed it, root.analysis
    // stayed undefined forever and the auto-analyze loop never fired
    // ("why its not doing analysis", reported 2026-06-12). Composes the
    // two real endpoints; analysis = newest analyses row or null.
    getTranscriptView: async (id) => {
      const [utterances, analyses] = await Promise.all([
        this._ws(
          'meet.listUtterances',
          `/meet/rooms/${encodeURIComponent(id)}/utterances`
        ),
        this._ws(
          'meet.listTranscripts',
          `/meet/rooms/${encodeURIComponent(id)}/transcripts`
        )
      ])
      const u = Array.isArray(utterances) ? utterances : utterances?.data || []
      const a = Array.isArray(analyses) ? analyses : analyses?.data || []
      return { utterances: u, analysis: a[0] || null }
    },
    waitingRoom: () => this._ws('meet.waitingRoom', '/meet/waiting-room'),
    // Host actions on a meet_waiting_room row. RLS policy
    // meet_waiting_room_update gates these to the parent room's creator
    // via is_meet_room_owner. Replaces direct sb.from('meet_waiting_room')
    // .update() calls in updateRoomSettings.js.
    admitGuest: (waitingId) =>
      this._ws(
        'meet.admitGuest',
        `/meet/waiting-room/${encodeURIComponent(waitingId)}/admit`,
        {
          method: 'POST'
        }
      ),
    rejectGuest: (waitingId) =>
      this._ws(
        'meet.rejectGuest',
        `/meet/waiting-room/${encodeURIComponent(waitingId)}/reject`,
        {
          method: 'POST'
        }
      ),
    issueToken: (params) =>
      this._ws('meet.issueToken', '/meet/token', {
        method: 'POST',
        body: { params }
      }),
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
      this._ws(
        'meet.getTranscriptView',
        `/meet/rooms/${encodeURIComponent(roomId)}/transcript-view`
      ),
    // Patch the `applied_items` array on a meet_transcript_analyses row
    // when the user "applies" a suggestion (saves as note, creates
    // ticket, etc). RLS allows room members to modify this column only.
    updateAnalysisAppliedItems: (roomId, appliedItems) =>
      this._ws(
        'meet.updateAnalysisAppliedItems',
        `/meet/rooms/${encodeURIComponent(roomId)}/analysis/applied-items`,
        {
          method: 'PATCH',
          body: { applied_items: appliedItems }
        }
      )
  }

  // Documents alias dropped — canonical surfaces are:
  //   sdk.docs.{list,get,create,update,remove}
  //   sdk.docs.{documents,kbArticles,notes,userDocs}.* — type-specific sugar
  //   sdk.resourceLinks.{list,create,remove,removeByPair}
  // workspace-project Supabase docs wrappers are gone; no back-compat alias.

  // --- Presence ---------------------------------------------------------------
  presence = {
    // Presence follows the workspace the tab is VIEWING (server membership-
    // validates; fail-closed to the claim).
    online: (workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('presence.online', `/presence/online${qs}`)
    },
    heartbeat: (workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('presence.heartbeat', `/presence/heartbeat${qs}`, {
        method: 'POST'
      })
    }
  }

  // --- Notifications ----------------------------------------------------------
  // Mongo cutover complete (2026-07): the reads + mark methods route to the
  // /core/notifications routes (BaseService._request →
  // `${apiUrl}/core/notifications`, Mongo-token auth). The legacy
  // workspace-project worker rollback arms are gone — the /core path is the
  // only one. Wire shapes are unchanged (the server NotificationController
  // returns { data } / { count } / { ok } envelopes the same way the worker
  // relay did), so consumers don't branch.
  notifications = {
    list: () =>
      this._request('/notifications', {
        method: 'GET',
        methodName: 'notifications.list'
      }),
    unreadCount: () =>
      this._request('/notifications/unread-count', {
        method: 'GET',
        methodName: 'notifications.unreadCount'
      }),
    // create() stays on the worker surface (Mongo-backed server-side) — the
    // realtime INSERT delivery keys off that write path. Repointing create
    // is a later increment.
    create: (payload) =>
      this._ws('notifications.create', '/notifications', {
        method: 'POST',
        body: { payload }
      }),
    markRead: (id) =>
      this._request(`/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        methodName: 'notifications.markRead'
      }),
    markAllRead: () =>
      this._request('/notifications/mark-all-read', {
        method: 'POST',
        methodName: 'notifications.markAllRead'
      })
  }

  // --- Search -----------------------------------------------------------------
  search = (q, opts) => {
    const { workspaceId, ...rest } =
      opts && typeof opts === 'object' ? opts : {}
    const wsId = this._chatWorkspaceId(workspaceId)
    const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
    return this._ws('search', `/search${qs}`, {
      method: 'POST',
      body: { q, ...rest }
    })
  }

  // --- Permissions ------------------------------------------------------------
  permissions = {
    me: () => this._ws('permissions.me', '/permissions/me'),
    check: (action, resource) =>
      this._ws('permissions.check', '/permissions/check', {
        method: 'POST',
        body: { action, resource }
      })
  }

  // --- System -----------------------------------------------------------------
  system = {
    status: () => this._ws('system.status', '/system/status'),
    featureFlags: () => this._ws('system.featureFlags', '/system/feature-flags')
  }

  // --- People -----------------------------------------------------------------
  people = {
    list: (workspaceId) => {
      const wsId = this._chatWorkspaceId(workspaceId)
      const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ''
      return this._ws('people.list', `/people${qs}`)
    },
    get: (id) => this._ws('people.get', `/people/${encodeURIComponent(id)}`),
    me: () => this._ws('people.me', '/people/me')
  }

  // --- Activity ---------------------------------------------------------------
  activity = {
    listNotes: () => this._ws('activity.listNotes', '/activity/notes'),
    addNote: (payload) =>
      this._ws('activity.addNote', '/activity/notes', {
        method: 'POST',
        body: { payload }
      }),
    scoringConfig: () =>
      this._ws('activity.scoringConfig', '/activity/scoring-config'),
    // Bulk PATCH activity_scoring_config rows. The body shape is
    // { rows: [{ activity_type, enabled, score, … }, …] } — server iterates
    // and applies each (admin-gated). Returns { ok: true } on success.
    updateScoringConfig: (payload) =>
      this._ws('activity.updateScoringConfig', '/activity/scoring-config', {
        method: 'PATCH',
        body: { payload }
      }),
    // Aggregated activity_events count grid for the heatmap UI. Returns
    // rows from public.activity_events scoped to the caller and a date
    // range (defaults to the last 365 days). Heavily used by the
    // ActivityHeatmap component — the wrapper does the user_email +
    // workspace_id scoping server-side.
    heatmap: (filter) =>
      this._ws('activity.heatmap', '/activity/heatmap', {
        method: 'POST',
        body: { filter }
      }),
    // Per-day activity_events list for one user. Used by the heatmap
    // tooltip / details drawer.
    listEvents: (filter) =>
      this._ws('activity.listEvents', '/activity/events', {
        method: 'POST',
        body: { filter }
      })
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

  // Mongo cutover complete (2026-07). Methods route to the Mongo
  // /core/announcements routes (BaseService._request → `${apiUrl}/core/...`,
  // Mongo-token auth) and unwrap the `{ announcements } / { announcement }`
  // envelope back to the exact array / row shape the readers consume, so
  // loadPrivateData.js's `.map(...)` is unchanged. The legacy
  // _sbCrud('announcements') rollback arm is gone — /core is the only path.
  announcements = {
    list: () =>
      this._request('/announcements', {
        method: 'GET',
        methodName: 'announcements.list'
      }).then((r) => (Array.isArray(r) ? r : (r?.announcements ?? []))),
    get: (id) =>
      this._request(`/announcements/${encodeURIComponent(id)}`, {
        method: 'GET',
        methodName: 'announcements.get'
      }).then((r) => r?.announcement ?? r),
    create: (payload) =>
      this._request('/announcements', {
        method: 'POST',
        body: JSON.stringify({ payload }),
        methodName: 'announcements.create'
      }).then((r) => r?.announcement ?? r),
    update: (id, payload) =>
      this._request(`/announcements/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ payload }),
        methodName: 'announcements.update'
      }).then((r) => r?.announcement ?? r),
    remove: (id) =>
      this._request(`/announcements/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        methodName: 'announcements.remove'
      }),
    // Toggle a reactor on one emoji — persists via the /core route. The
    // server resolves the reactor from the caller's identity.
    toggleReaction: (id, emoji, reactor) =>
      this._request(`/announcements/${encodeURIComponent(id)}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji, reactor }),
        methodName: 'announcements.toggleReaction'
      }).then((r) => r?.announcement ?? r)
  }
  // stories entity removed — stories table dropped in migration 0162 (feature retired 2026-06-02; no Mongo successor).
  // birthdays + valuations entities removed 2026-07 — tables dropped with the
  // workspace-project Supabase org retirement; the shell derives birthdays
  // from the roster by default and valuations had no live consumer.
  // Same resolution order as _recordsWorkspaceId, but returns null instead of
  // throwing: /core/file-canvas runs attachExplicitWorkspaceIfMember and
  // resolves the workspace itself when none is sent, so a missing scope is
  // normal here rather than a caller error. Returns the RAW id — every call
  // site escapes it (URLSearchParams.set does so itself; a pre-encoded value
  // would be escaped a second time and no longer match the workspace).
  _fileCanvasWorkspaceId(source, options) {
    const ws =
      (options && options.workspaceId) ||
      (source && typeof source === 'object' && source.workspaceId) ||
      this._context?.activeWorkspaceId
    return ws ? String(ws) : null
  }

  // Mongo cutover. /core/file-canvas/* has been Mongo-by-default since
  // 2026-07-03 (FILE_CANVAS_STORE unset → mongo); this namespace was simply
  // never repointed, so the SDK kept the `/sb` passthrough alive on its own —
  // a pure SDK lag, not an unfinished migration.
  //
  // Drop-in: FileCanvasService.serializeNode emits the SAME snake_case
  // PostgREST contract (id / workspace_id / kind / name / parent_id / x / y /
  // file_id / url / mime_type / size / doc_id / scope / created_by /
  // created_at / updated_at) that the passthrough returned, so every consumer
  // — the /files desktop's `fileCanvasFetch` transform and aiWorkspaceOps —
  // reads identically.
  //
  // Workspace scope: the route runs attachExplicitWorkspaceIfMember, which
  // honors an explicit `workspaceId` only when the caller is a member and
  // otherwise falls back to the domain's own resolution. So threading the
  // tab's activeWorkspaceId is an optimization, never a requirement — unlike
  // records below, this must NOT throw when there is no workspace in context.
  fileCanvas = {
    // `filter.parent_id` maps onto ?parentId=. An explicit null (desktop root)
    // has to survive as the string 'root' — `?parentId=` empty would be
    // indistinguishable from "not filtering at all" once it round-trips.
    list: (filter, options) => {
      const params = new URLSearchParams()
      if (filter && typeof filter === 'object' && 'parent_id' in filter) {
        params.set(
          'parentId',
          filter.parent_id == null ? 'root' : String(filter.parent_id)
        )
      }
      const ws = this._fileCanvasWorkspaceId(filter, options)
      if (ws) params.set('workspaceId', ws)
      const qs = params.toString()
      return this._request(`/file-canvas${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        methodName: 'fileCanvas.list'
      }).then((r) => (Array.isArray(r) ? r : (r?.data ?? [])))
    },
    get: (id, options) => {
      const ws = this._fileCanvasWorkspaceId(null, options)
      return this._request(
        `/file-canvas/${encodeURIComponent(id)}${ws ? `?workspaceId=${encodeURIComponent(ws)}` : ''}`,
        { method: 'GET', methodName: 'fileCanvas.get' }
      ).then((r) => r?.data ?? r)
    },
    create: (payload, options) => {
      const ws = this._fileCanvasWorkspaceId(payload, options)
      return this._request(
        `/file-canvas${ws ? `?workspaceId=${encodeURIComponent(ws)}` : ''}`,
        {
          method: 'POST',
          body: JSON.stringify(payload || {}),
          methodName: 'fileCanvas.create'
        }
      ).then((r) => r?.data ?? r)
    },
    update: (id, payload, options) => {
      const ws = this._fileCanvasWorkspaceId(payload, options)
      return this._request(
        `/file-canvas/${encodeURIComponent(id)}${ws ? `?workspaceId=${encodeURIComponent(ws)}` : ''}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload || {}),
          methodName: 'fileCanvas.update'
        }
      ).then((r) => r?.data ?? r)
    },
    remove: (id, options) => {
      const ws = this._fileCanvasWorkspaceId(null, options)
      return this._request(
        `/file-canvas/${encodeURIComponent(id)}${ws ? `?workspaceId=${encodeURIComponent(ws)}` : ''}`,
        { method: 'DELETE', methodName: 'fileCanvas.remove' }
      )
    }
  }
  // Generic record store backing AI-generated extensions. Mongo cutover
  // complete (2026-07-25, tickets/server.md "workspace records data-plane
  // split"): routes to /core/workspaces/:id/records over the SAME Mongo
  // `WorkspaceRecord` model the agent tools (create/list/update/
  // delete_workspace_record) write — a row seeded by either path is
  // immediately visible to the other. The legacy _sbCrud('workspace_records')
  // Supabase passthrough is gone; its few dev rows are orphaned by design.
  // Wire shape matches what apps always consumed:
  //   { id, collection, name, data, created_at, updated_at }
  // Workspace scope: explicit `workspaceId` (filter/options) wins, else the
  // live _context.activeWorkspaceId — the /core route path REQUIRES one.
  _recordsWorkspaceId(filter, options) {
    const ws =
      (options && options.workspaceId) ||
      (filter && typeof filter === 'object' && filter.workspaceId) ||
      this._context?.activeWorkspaceId
    if (!ws) {
      throw new Error(
        "[sdk records] no workspace scope — pass { workspaceId } or set the SDK's activeWorkspaceId."
      )
    }
    return encodeURIComponent(String(ws))
  }

  records = {
    // Pagination (tickets/server.md "records plane silently CAPS list at
    // 100 rows, no marker, no total, no warning" — this is the SDK half of
    // the fix, server half in WorkspaceRecordsController/Service). The
    // route now always answers { success, data, pagination } where
    // pagination is { page, limit, totalCount, pages, hasMore } (the same
    // shape UserController.getUserProjects uses elsewhere in /core) — an
    // explicit `limit` above the 100-row cap is REFUSED (HTTP 400
    // limit_exceeds_max, surfaced here as a thrown Error via _request) so a
    // caller can never silently receive a partial page.
    //
    // Backward compat: this method has ALWAYS returned a bare row array,
    // and a live consumer (icca-manage's iccaListAll) type-checks the
    // return with `Array.isArray()`, treating anything else as an EMPTY
    // page — switching to a `{ data, pagination }` wrapper would silently
    // zero out every collection for that caller (and any other consumer
    // doing the same reasonable check). Arrays are objects in JS, so
    // `pagination` is attached directly ONTO the returned array instead of
    // wrapping it: `Array.isArray()`, `.length`, `.map()`, spread and
    // `for...of` all stay byte-identical to before, while a caller that
    // knows to look can read `rows.pagination.hasMore` /
    // `rows.pagination.totalCount` to detect a partial page.
    list: async (filter, options) => {
      const ws = this._recordsWorkspaceId(filter, options)
      const params = new URLSearchParams()
      const collection =
        filter && typeof filter === 'object' && filter.collection
          ? filter.collection
          : null
      if (collection) params.set('collection', String(collection))
      if (options?.limit != null) params.set('limit', String(options.limit))
      // `page` (1-indexed, the canonical /core convention) wins server-side
      // when both are given — see WorkspaceRecordsController.list.
      if (options?.page != null) params.set('page', String(options.page))
      if (options?.offset != null) params.set('offset', String(options.offset))
      if (options?.order) params.set('order', String(options.order))
      const qs = params.toString()
      const r = await this._request(
        `/workspaces/${ws}/records${qs ? `?${qs}` : ''}`,
        {
          method: 'GET',
          methodName: 'records.list'
        }
      )
      const rows = r?.data ?? []
      if (r?.pagination) rows.pagination = r.pagination
      return rows
    },
    get: async (id, options) => {
      const ws = this._recordsWorkspaceId(null, options)
      const r = await this._request(
        `/workspaces/${ws}/records/${encodeURIComponent(id)}`,
        {
          method: 'GET',
          methodName: 'records.get'
        }
      )
      return r?.data ?? null
    },
    create: async (payload, options) => {
      const ws = this._recordsWorkspaceId(payload, options)
      const r = await this._request(`/workspaces/${ws}/records`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
        methodName: 'records.create'
      })
      return r?.data ?? r
    },
    update: async (id, payload, options) => {
      const ws = this._recordsWorkspaceId(payload, options)
      const r = await this._request(
        `/workspaces/${ws}/records/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload || {}),
          methodName: 'records.update'
        }
      )
      return r?.data ?? r
    },
    // Live change stream — the member-facing relay of the server's
    // workspaceRecordEvents bus (GET /workspaces/:id/records/stream, SSE).
    // Thin envelopes ({ collection, action, at }, never row data): on an event
    // the caller re-reads through list/get above, which is where the grant
    // lives. Same transport + reconnect machinery as tickets.subscribe — this
    // is what makes a record surface realtime the way the tasks board is.
    // Returns unsubscribe().
    subscribe: (filter, onEvent) => {
      const f = filter || {}
      const ws = this._recordsWorkspaceId(f, null)
      const collection = f.collection || f.collectionKey || ''
      return this._sseSubscribe(
        `/workspaces/${ws}/records/stream`,
        { collection },
        onEvent,
        {
          flatParams: true,
          events: [
            {
              name: 'records.open',
              frame: (data) => ({ type: 'records.open', ...data })
            },
            {
              name: 'records.change',
              frame: (data) => ({ type: 'records.change', ...data })
            }
          ]
        }
      )
    },
    remove: async (id, options) => {
      const ws = this._recordsWorkspaceId(null, options)
      const r = await this._request(
        `/workspaces/${ws}/records/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          methodName: 'records.remove'
        }
      )
      return r?.data ?? r
    }
  }

  // analyzed entity removed 2026-07 — the workspace-project worker's Supabase
  // analyzed surface was deleted server-side (server@fb183f5b); the
  // dispatcher's `workspaceProject.analyzed*` aliases delegate to the
  // top-level Mongo-backed AnalyzedService (/core/analyzed/*), and
  // TrackingService's default transport now ships through
  // context.services.analyzed.ingest directly.

  // companyInfo + companySettings entities removed 2026-07 — tables dropped
  // with the workspace-project Supabase org retirement; the shell reads
  // workspace.settings.companyInfo (WorkspaceService PATCH writer) instead.

  // Per-user preferences — one document keyed by the caller's identity.
  // Mongo cutover complete (2026-07): both methods route to GET/PUT
  // /core/prefs/user and unwrap the `{ prefs }` envelope back to the flat
  // object the reader (root.userPrefs) consumes. The legacy
  // _sb('user_preferences') rollback arm is gone — /core is the only path.
  // The /core path persists ad-hoc keys (homeWelcomeDismissed, …) the typed
  // Supabase columns silently dropped. Caller treats null as "no prefs yet"
  // and renders defaults.
  userPreferences = {
    get: async () => {
      const r = await this._request('/prefs/user', {
        method: 'GET',
        methodName: 'userPreferences.get'
      })
      return r?.prefs ?? null
    },
    upsert: (payload) =>
      this._request('/prefs/user', {
        method: 'PUT',
        body: JSON.stringify({ payload }),
        methodName: 'userPreferences.upsert'
      }).then((r) => r?.prefs ?? r)
  }

  // Per-user, per-workspace home dashboard prefs (hidden_widgets / grid_layout /
  // dashboard_v) — real cross-device persistence, keyed on
  // (user, workspace). Mongo cutover complete (2026-07): GET/PUT
  // /core/prefs/home-dashboard, unwrapping `{ prefs }` to the snake_case row
  // (hidden_widgets / grid_layout / dashboard_v) the reader
  // (root.userDashboardPrefs) + resolver consume. The legacy
  // _sb('home_dashboard_prefs') rollback arm is gone — /core is the only path.
  // Both methods accept an optional `{ workspaceId }` options arg — an explicit
  // scope pin (query param on GET, body field on PUT; the server's
  // readExplicitWorkspaceId honors both, membership-gated). The home page pins
  // every layout write to the workspace the snapshot was taken in so a write
  // debouncing across a workspace switch can never land under the new
  // workspace's row (the cross-workspace layout-clobber fix).
  homeDashboardPrefs = {
    get: async (opts) => {
      const ws = opts?.workspaceId
      const qs = ws ? `?workspaceId=${encodeURIComponent(ws)}` : ''
      const r = await this._request(`/prefs/home-dashboard${qs}`, {
        method: 'GET',
        methodName: 'homeDashboardPrefs.get'
      })
      return r?.prefs ?? null
    },
    upsert: (payload, opts) =>
      this._request('/prefs/home-dashboard', {
        method: 'PUT',
        body: JSON.stringify({
          payload,
          ...(opts?.workspaceId ? { workspaceId: opts.workspaceId } : {})
        }),
        methodName: 'homeDashboardPrefs.upsert'
      }).then((r) => r?.prefs ?? r)
  }

  // Per-workspace admin default panel set (one document per workspace).
  // Members read it; org-admins write it (gated server-side). Mongo cutover
  // complete (2026-07): GET/PUT /core/prefs/workspace-defaults, unwrapping
  // `{ defaults }` to the snake_case row (home_default_panels) the reader
  // consumes. The legacy _sb('workspace_dashboard_defaults') rollback arm is
  // gone — /core is the only path.
  workspaceDashboardDefaults = {
    get: async () => {
      const r = await this._request('/prefs/workspace-defaults', {
        method: 'GET',
        methodName: 'workspaceDashboardDefaults.get'
      })
      return r?.defaults ?? null
    },
    upsert: (payload) =>
      this._request('/prefs/workspace-defaults', {
        method: 'PUT',
        body: JSON.stringify({ payload }),
        methodName: 'workspaceDashboardDefaults.upsert'
      }).then((r) => r?.defaults ?? r)
  }

  // workspaceSettings entity removed 2026-07 — the workspace_settings table
  // dropped with the workspace-project Supabase org retirement. The canonical
  // writer is the merge-safe `workspace.settings` PATCH
  // (WorkspaceService.updateWorkspaceSettings); readers get settings off the
  // workspace document (sdk.getWorkspace).

  // userGrants entity removed 2026-07 — user_grants table dropped with the
  // workspace-project Supabase org retirement; no live consumer.

  // user_profiles — the LAST table on the `/sb` passthrough, now on
  // PATCH /core/user-profile. With this repoint the SDK has no `_sb()` callers
  // left, which is what makes retiring the proxy possible.
  //
  // WHAT MOVED, precisely: the HR subset (bio / city / country / notes /
  // position→title / status→employmentStatus). The FINANCIAL cap-table columns
  // did NOT move, and do not need to: in the default PROFILE_STORE=mongo mode
  // they had ALREADY stopped reaching callers. PeopleService only fills its
  // Supabase profile map on the `!hrFromMongo` rollback path, so `stocks` /
  // `monthly_stocks` have resolved to null in the live product since the
  // 2026-07-03 cutover. The Supabase ROWS still hold that data — export it
  // before the project is decommissioned if anyone needs the history.
  //
  // `userId` is accepted but NOT used to target the row, and that is not an
  // oversight. The proxy hard-pinned this table to the caller
  // (USER_SCOPED_TABLES: `_scopeQuery` overwrote any user_id filter,
  // `_scopeBody` overwrote row.user_id), so no caller has ever been able to
  // write another user's profile here. The /core route keeps that boundary
  // rather than silently widening it during a data-plane move. The parameter
  // stays so the 7 existing call sites need no edit.
  //
  // list / get are REMOVED — neither had a live caller anywhere in the
  // monorepo (every apparent hit was the EntityDispatcher's own method map).
  userProfiles = {
    update: (userId, payload) =>
      this._request('/user-profile', {
        method: 'PATCH',
        body: JSON.stringify(payload || {}),
        methodName: 'userProfiles.update'
      }).then((r) => r?.data ?? r)
  }

  // The activity routes are path-scoped (/workspaces/:workspaceId/...), so a
  // workspace is REQUIRED — throw like records rather than returning null, so a
  // scopeless call fails at the SDK instead of 404-ing on a malformed path.
  _activityWorkspaceId(source, options) {
    const ws =
      (options && options.workspaceId) ||
      (source && typeof source === 'object' && source.workspaceId) ||
      this._context?.activeWorkspaceId
    if (!ws) {
      throw new Error(
        "[sdk activity] no workspace scope — pass { workspaceId } or set the SDK's activeWorkspaceId."
      )
    }
    return encodeURIComponent(String(ws))
  }

  // Daily standup rows — one per (author, date).
  //
  // Mongo cutover: routes to /core/workspaces/:id/standups (ActivityService →
  // the activity store's Mongo arm, which carries the A1/A5 guards). Was the
  // `standup_activity` /sb passthrough; the store and service shipped with the
  // cutover but the routes were never mounted, so the SDK had nowhere to move
  // to and kept the proxy alive by itself.
  //
  // POST is an UPSERT on (author, date) server-side, so `create` and `upsert`
  // are the same call. That also retires
  // SDK-WORKSPACE-STANDUPS-UPSERT-WRONG-CONFLICT-COL by construction: the
  // conflict target is no longer a token the client spells — PostgREST used to
  // reject every upsert with `column "author_email" does not exist`
  // (/logs id=77428) because the legacy caller passed the wrong column name.
  standups = {
    list: (filter, options) => {
      const ws = this._activityWorkspaceId(filter, options)
      const params = new URLSearchParams()
      const author =
        (filter &&
          typeof filter === 'object' &&
          (filter.author ?? filter.author_email)) ||
        null
      if (author) params.set('author', String(author))
      if (filter && typeof filter === 'object' && filter.date) {
        params.set('date', String(filter.date))
      }
      if (options?.limit != null) params.set('limit', String(options.limit))
      const qs = params.toString()
      return this._request(`/workspaces/${ws}/standups${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        methodName: 'standups.list'
      }).then((r) => r?.data ?? [])
    },
    get: (id, options) => {
      const ws = this._activityWorkspaceId(null, options)
      return this._request(
        `/workspaces/${ws}/standups/${encodeURIComponent(id)}`,
        {
          method: 'GET',
          methodName: 'standups.get'
        }
      ).then((r) => r?.data ?? null)
    },
    create: (payload, options) => {
      const ws = this._activityWorkspaceId(payload, options)
      return this._request(`/workspaces/${ws}/standups`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
        methodName: 'standups.create'
      }).then((r) => r?.data ?? r)
    },
    update: (id, payload, options) => {
      const ws = this._activityWorkspaceId(payload, options)
      return this._request(
        `/workspaces/${ws}/standups/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload || {}),
          methodName: 'standups.update'
        }
      ).then((r) => r?.data ?? r)
    },
    upsert: (payload, options) => {
      const ws = this._activityWorkspaceId(payload, options)
      return this._request(`/workspaces/${ws}/standups`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
        methodName: 'standups.upsert'
      }).then((r) => r?.data ?? r)
    }
  }

  // Audit log — was the `activity_events` /sb passthrough, now
  // GET /core/workspaces/:id/activity-log. The read stays superadmin-only,
  // enforced in ActivityService.listAudit by the store's A3 guard (the same
  // boundary the proxy applied via ADMIN_ONLY_TABLES) — the route being
  // membership-gated does not widen it.
  //
  // The old PostgREST filter shape ({ actor_email_in, created_at: { gte } })
  // is NOT forwarded: the /core route takes `limit` only and orders by
  // created_at desc server-side. No live caller passed those filters.
  auditLog = {
    list: (filter, options) => {
      const ws = this._activityWorkspaceId(filter, options)
      const limit =
        options?.limit ??
        (filter && typeof filter === 'object' ? filter.limit : null)
      const qs =
        limit != null ? `?limit=${encodeURIComponent(String(limit))}` : ''
      return this._request(`/workspaces/${ws}/activity-log${qs}`, {
        method: 'GET',
        methodName: 'auditLog.list'
      }).then((r) => r?.data ?? [])
    }
  }

  // rolePermissions entity removed — dead SDK surface with zero callers
  // (the /admin/permissions UI retired the role_permissions fetch). The
  // role_permissions table itself WAS dropped in migration 0161 (2026-06);
  // the Mongo successor is Team.permissions[].

  // --- AI surface retired 2026-05-20 -----------------------------------------
  // Both ai.chat and ai.meetAnalyze moved off Supabase. All AI inference
  // now lives on the main server at /core/ai-chat/*. Use:
  //   sdk.aiChat.completion(payload)
  //   sdk.aiChat.stream(payload, callbacks)
  //   sdk.aiChat.meetAnalyze({ roomId, force })
  // See sdk/src/services/AiChatService.js.

  // agentMessages entity removed — dead SDK surface (agent_messages table
  // dropped in migration 0159; zero live callers). The referenced
  // shared/functions/agentMessages.js never existed. The realtime
  // subscribeAgentMessages method + its EntityDispatcher routes were removed
  // in the same change set.

  // feed (+ feed.likes / feed.comments) and follows entities removed 2026-07 —
  // the community feed + follow graph tables (0106_community_feed.sql) were
  // dropped with the workspace-project Supabase org retirement; no live
  // consumers and no Mongo successor.

  // --- i18n (translation stream) --------------------------------------------
  // Stub backend wire-up — TranslationWatcher subscribes to translation diffs
  // for the active lang+namespace tuple. Returns a noop unsub today; once
  // backend ships an i18n stream, fill in subscribeTranslations.
  i18n = {
    subscribeTranslations: (_filter, _cb) => {
      void _filter
      void _cb
      // TODO[sdk-i18n-stream]: dispatch through socket/SSE once backend ships.
      return () => {}
    }
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

  setRealtimeProvider(fn) {
    this._realtimeProvider = typeof fn === 'function' ? fn : null
  }

  _realtimeSubscribe(op, filter, callback) {
    const p = this._realtimeProvider
    if (typeof p !== 'function' || typeof callback !== 'function')
      return () => {}
    try {
      const unsub = p({ op, filter: filter || {}, callback })
      return typeof unsub === 'function' ? unsub : () => {}
    } catch (err) {
      // Don't crash callers on provider errors — log + return noop.
      // eslint-disable-next-line no-console
      console.warn(
        `[sdk.workspaceProject.realtime] provider failed for op '${op}':`,
        err?.message || err
      )
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
        try {
          cb(framed.kind, framed.payload)
        } catch (_) {
          /* listener errors don't propagate */
        }
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
      if (Array.isArray(tables) && tables.length)
        filter.tables = tables.join(',')
      else if (typeof tables === 'string' && tables) filter.tables = tables

      return this._sseSubscribe('/meet/stream', filter, deliver, {
        events,
        flatParams: true
      })
    },

    // Server-SSE chat subscription (chat-realtime-spec §5 — the SSE transport
    // behind CHAT_REALTIME=sse|both). The EXACT analog of subscribeMeetSse:
    // reuses the proven tickets `_sseSubscribe` EventSource client (query-param
    // auth, exp-backoff reconnect) and re-frames the server's
    // `chat.<entity>.<verb>` event envelope back into the SAME callback shape
    // the Supabase chat path emitted — so the consumer (subscribeRealtime.js)
    // stays byte-unchanged.
    //
    // ── Wire contract (server src/domains/chat/stream/ChatStreamController.js) ─
    // ONE multiplexed stream per session: GET /core/chat/stream?workspaceId=…,
    // FLAT query params (the controller reads req.query.workspaceId directly,
    // same as the meet route → flatParams:true). The server `data:` is shaped
    // per-entity (the controller's `_wireData`): `{ message: row }`,
    // `{ channel: row }`, `{ member: row }`, `{ mention: row }`, and the
    // snapshot `{ channels, members, mentionsUnread }`. Rows are snake_case,
    // byte-shaped like the PostgREST rows the frontend already parses (D6).
    //
    // ── Re-framing → the Supabase-shape callback (spec §5.2) ──────────────────
    // The Supabase chat path delivered `(op, { eventType, new, old, _kind? })`.
    // This re-framer reconstructs that envelope from the SSE entity payload +
    // the verb encoded in the event NAME, then invokes `cb(kind, payload)`:
    //   chat.message.insert  → cb('chat.messages',  { eventType:'INSERT', new: row,  old: null })
    //   chat.message.update  → cb('chat.messages',  { eventType:'UPDATE', new: row,  old: null })
    //   chat.message.delete  → cb('chat.messages',  { eventType:'DELETE', new: null, old: row  })
    //   chat.channel.*       → cb('chat.channels',  { eventType, new|old })          (no _kind)
    //   chat.member.*        → cb('chat.channels',  { eventType, new|old, _kind:'member' })
    //   chat.mention.insert  → cb('chat.mentions',  { eventType:'INSERT', new: row })
    //   chat.snapshot        → cb('chat.snapshot',  { channels, members, mentionsUnread })
    // The `kind` mirrors the provider's chat op vocabulary so a consumer can
    // route by op; the `payload` is the Supabase-style envelope so every
    // existing `payload.new`/`payload.old`/`payload.eventType` read lands
    // unchanged. `error` frames carry no consumer branch — swallowed.
    subscribeChatSse: ({ workspaceId, channelIds, tables } = {}, cb) => {
      if (typeof cb !== 'function') return () => {}

      // (kind, payload) adapter: each event frame returns { kind, payload };
      // a frame returning undefined is swallowed.
      const deliver = (framed) => {
        if (!framed || !framed.kind) return
        try {
          cb(framed.kind, framed.payload)
        } catch (_) {
          /* listener errors don't propagate */
        }
      }

      // Optional client-side channel filter (the drawer subscribes to ONE
      // channel; the stream is per-session, so filter the message/member
      // events here — parity with the Supabase `channel_id=eq.` filter).
      const channelSet =
        Array.isArray(channelIds) && channelIds.length
          ? new Set(channelIds.map((x) => String(x)))
          : null
      const _chanOf = (row) =>
        row && (row.channel_id != null ? String(row.channel_id) : null)
      const _passesChannel = (row) =>
        !channelSet || (row != null && channelSet.has(_chanOf(row)))

      // Build the Supabase-style envelope for an entity row + verb.
      const entityFrame = (kind, verb, key) => (data) => {
        const row = data?.[key]
        if (verb !== 'DELETE' && channelSet && !_passesChannel(row))
          return undefined
        if (verb === 'DELETE' && channelSet && !_passesChannel(row))
          return undefined
        const payload =
          verb === 'DELETE'
            ? { eventType: 'DELETE', new: null, old: row }
            : { eventType: verb, new: row, old: null }
        return { kind, payload }
      }
      // Members carry the same envelope plus the `_kind:'member'` tag the
      // Supabase provider attached (parity with sdkRealtimeProvider.js).
      const memberFrame = (verb) => (data) => {
        const framed = entityFrame('chat.channels', verb, 'member')(data)
        if (!framed) return undefined
        framed.payload._kind = 'member'
        return framed
      }

      const events = [
        // snapshot — reconcile sidebar-critical state on connect/reconnect.
        {
          name: 'chat.snapshot',
          frame: (data) => ({ kind: 'chat.snapshot', payload: data || {} })
        },

        {
          name: 'chat.message.insert',
          frame: entityFrame('chat.messages', 'INSERT', 'message')
        },
        {
          name: 'chat.message.update',
          frame: entityFrame('chat.messages', 'UPDATE', 'message')
        },
        {
          name: 'chat.message.delete',
          frame: entityFrame('chat.messages', 'DELETE', 'message')
        },

        {
          name: 'chat.channel.insert',
          frame: entityFrame('chat.channels', 'INSERT', 'channel')
        },
        {
          name: 'chat.channel.update',
          frame: entityFrame('chat.channels', 'UPDATE', 'channel')
        },
        {
          name: 'chat.channel.delete',
          frame: entityFrame('chat.channels', 'DELETE', 'channel')
        },

        { name: 'chat.member.insert', frame: memberFrame('INSERT') },
        { name: 'chat.member.update', frame: memberFrame('UPDATE') },
        { name: 'chat.member.delete', frame: memberFrame('DELETE') },

        // mentions are INSERT-only (own-mention, server-enriched channel_id).
        {
          name: 'chat.mention.insert',
          frame: entityFrame('chat.mentions', 'INSERT', 'mention')
        },

        // post-header handler error: no consumer branch — swallow.
        { name: 'error', frame: () => undefined }
      ]

      // FLAT query params — the controller reads req.query.workspaceId / .tables
      // directly (NOT filter[workspaceId]). Only forward defined scope keys.
      // workspaceId defaults to the SDK's own activeWorkspaceId context when
      // the caller omits it (see _chatWorkspaceId / _resolveAuthHeader's
      // staleness guard above) so a subscribe() call after switchWorkspace
      // scopes to the NEW workspace even before any explicit caller update.
      const filter = {}
      const wsId = this._chatWorkspaceId(workspaceId)
      if (wsId) filter.workspaceId = wsId
      if (Array.isArray(tables) && tables.length)
        filter.tables = tables.join(',')
      else if (typeof tables === 'string' && tables) filter.tables = tables

      return this._sseSubscribe('/chat/stream', filter, deliver, {
        events,
        flatParams: true
      })
    }
    // subscribeAgentMessages removed — agent_messages table dropped in
    // migration 0159; the agentMessages entity had zero live callers.
  }

  // --- Storage (workspace-tenant buckets: contracts, chat-attachments, …) ---
  // GCS cutover complete (2026-07): every method routes to the GCS-backed
  // /core/storage routes (BaseService._request prepends /core for JSON; the
  // multipart upload raw-fetches the /core base directly because _request
  // can't carry FormData cleanly). The legacy workspace-project worker
  // `/storage/*` Supabase surface was DELETED server-side (server@fb183f5b),
  // so the rollback arms are gone — /core is the only path. Bucket access
  // authority is server-side; the frontend never sees storage credentials.
  //
  // Three-arg signed-URL: bucket + path + ttl (seconds). Default TTL 5 min
  // matches the legacy `sb.storage.from('contracts').createSignedUrl(path, 300)`
  // call site in MemberProfile so callers don't need to pass it explicitly.
  storage = {
    createSignedUrl: (bucket, path, ttl = 300) =>
      this._request(`/storage/${encodeURIComponent(bucket)}/signed-url`, {
        method: 'POST',
        body: JSON.stringify({ path, ttl }),
        methodName: 'storage.createSignedUrl'
      }),
    // multipart upload — body must be a FormData carrying { file, path? }.
    // The backend extracts `file` and forwards to the storage backend.
    upload: (bucket, formData, options = {}) => {
      // Bypass the JSON-body branch by composing the request here — _request
      // can't carry FormData cleanly.
      const _doUpload = async () => {
        this._requireReady('storage.upload')
        const base = `${this._apiUrl}/core/storage/${encodeURIComponent(bucket)}/upload`
        const init = { method: 'POST', body: formData, headers: {} }
        const auth = await this._resolveAuthHeader()
        if (auth) init.headers.Authorization = auth
        // Don't set Content-Type — browser sets multipart boundary itself.
        const res = await fetch(base, init)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
        return json
      }
      return _doUpload()
    },
    remove: (bucket, path) =>
      this._request(`/storage/${encodeURIComponent(bucket)}/object`, {
        method: 'DELETE',
        body: JSON.stringify({ path }),
        methodName: 'storage.remove'
      }),
    // Public download URL for a stored object — wraps the backend's public-url
    // endpoint so callers don't need the bucket service-role key.
    publicUrl: (bucket, path) =>
      this._request(`/storage/${encodeURIComponent(bucket)}/public-url`, {
        method: 'POST',
        body: JSON.stringify({ path }),
        methodName: 'storage.publicUrl'
      })
  }

  // --- Generic escape hatch ---------------------------------------------------
  query = (body) => this._ws('query', '/query', { method: 'POST', body })
}
