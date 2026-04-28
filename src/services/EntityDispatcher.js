// EntityDispatcher — single SDK entry point for the fetch plugin's 'sdk' adapter.
//
// Maps dotted entity paths (e.g. 'workspaceProject.tickets', 'organization.members')
// to existing service method calls. The fetch plugin (smbls/plugins/fetch) calls
// sdk.execute(from, op, args, cb) for declarative `fetch:` props on DOMQL elements.
//
// Adding an entity route is a strict-additive operation — register the path here
// and the entity becomes available declaratively across every consumer.
//
// Operation vocabulary:
//   list      — read multiple records (select)
//   get       — read one record by id
//   create    — insert a record
//   update    — modify a record
//   remove    — delete a record
//   subscribe — realtime channel subscription (returns unsubscribe handle)
//   rpc       — generic remote procedure call
//
// Service path syntax:
//   'methodName'           — flat method on the service
//   'group.methodName'     — nested namespace (e.g. WorkspaceProjectService.tickets.list)
//   'group.sub.methodName' — deeper nesting
//
// Argument shape — sdk.execute(from, op, args) passes `args` through, but services
// may expect multiple positional arguments (e.g. tickets.update(number, payload),
// chat.sendMessage(channelId, payload)). Each route MAY declare an `argMap` keyed
// by op that returns an array of positional arguments from the caller's args object:
//
//   argMap: {
//     update: (a) => [a?.id ?? a?.number, a?.payload ?? a?.data ?? a],
//     get:    (a) => [a?.id ?? a?.number ?? a],
//   }
//
// When `argMap` is omitted (or no entry for the op), args is passed as a single
// argument — preserves backwards-compatibility with single-arg service methods
// (`organization.list`, `chat.listChannels`, etc.).
//
// Routes are intentionally explicit: the dispatcher does NOT auto-resolve method
// names by convention. Every entity+op combination must be registered here.

// Common arg adapters reused across routes. Pulling args out of well-known
// shapes keeps individual routes terse — most CRUD entities follow the same
// (filter, options) / (id) / (id, payload) pattern.
const argMaps = {
  // (filter, options) for list — splits the adapter's params/options bag.
  filterOptions: (a) => [a?.filter ?? a?.params, {
    single: a?.single,
    limit: a?.limit,
    offset: a?.offset,
    order: a?.order,
    ...(a?.options || {})
  }],
  // (id) for get/remove — accepts id, number, or the bare arg.
  id: (a) => [a?.id ?? a?.number ?? a],
  // (payload) for create — payload may live under .payload, .data, or be the bare arg.
  payload: (a) => [a?.payload ?? a?.data ?? a],
  // (id, payload) for update — id pulled like .id helper, payload like .payload helper.
  idPayload: (a) => [
    a?.id ?? a?.number,
    a?.payload ?? a?.data ?? (() => {
      const { id, number, ...rest } = a || {}
      return rest
    })()
  ],
}

const CRUD_ARG_MAP = {
  list: argMaps.filterOptions,
  get: argMaps.id,
  create: argMaps.payload,
  update: argMaps.idPayload,
  remove: argMaps.id,
}

const ENTITY_ROUTES = {
  // ─── i18n (translations stream) ────────────────────────────────────────────
  // The TranslationWatcher in workspace/app.js subscribes to live translation
  // diffs. Backend i18n stream hasn't shipped — for now this route is a noop
  // subscribe that returns an unsub function so the fetch plugin doesn't
  // throw "Unknown entity". When the backend i18n service ships, swap the
  // body inside WorkspaceProjectService.i18n.subscribeTranslations to dispatch
  // through the live wire and consumers light up automatically.
  'i18n.translations': {
    service: 'workspaceProject',
    methods: { subscribe: 'i18n.subscribeTranslations' },
    argMap: { subscribe: (a) => [{ lang: a?.lang ?? a?.filter?.lang, namespace: a?.namespace ?? a?.filter?.namespace }] },
  },

  // ─── Auth + identity ───────────────────────────────────────────────────────
  'auth.session': {
    service: 'auth',
    methods: { list: 'getSession', subscribe: 'onAuthStateChange' },
  },
  'auth.me': {
    service: 'auth',
    methods: { list: 'getMe', get: 'getMe', update: 'updateMe' },
  },
  'auth.permissions': {
    service: 'auth',
    methods: { list: 'getPermissions' },
  },

  // ─── Organization (top-level tenant) ──────────────────────────────────────
  'organization': {
    service: 'organization',
    methods: { list: 'list', get: 'get', create: 'create', update: 'update', remove: 'remove' },
  },
  'organization.members': {
    service: 'organization',
    methods: { list: 'listMembers', create: 'inviteMember', remove: 'removeMember' },
  },
  'organization.roles': {
    service: 'organization',
    methods: { list: 'listRoles' },
  },

  // ─── Workspace (build environment / pricing tier) ─────────────────────────
  'workspace': {
    service: 'workspace',
    methods: {
      list: 'listWorkspaces',
      get: 'getWorkspace',
      create: 'createWorkspace',
      update: 'updateWorkspace',
      remove: 'deleteWorkspace',
    },
  },
  'workspace.members': {
    service: 'workspace',
    methods: { list: 'listWorkspaceMembers', create: 'addWorkspaceMember' },
  },

  // ─── Workspace Project (activity — tickets, chat, calendar, etc.) ─────────
  // Each workspaceProject service method takes positional args
  // (filter, options) / (id) / (id, payload) etc., so every route below
  // gets a CRUD argMap so sdk.execute() can fan adapter args out correctly.
  'workspaceProject.tickets': {
    service: 'workspaceProject',
    methods: {
      list: 'tickets.list',
      get: 'tickets.get',
      create: 'tickets.create',
      update: 'tickets.update',
      remove: 'tickets.remove',
      // tickets.assign(id, assigneeEmail) — separate op so callers can
      // route through sdk.execute('workspaceProject.tickets', 'assign',
      // { id, assignee }) instead of importing the service directly.
      assign: 'tickets.assign',
      epicCounts: 'tickets.epicCounts',
    },
    argMap: {
      ...CRUD_ARG_MAP,
      assign: (a) => [a?.id ?? a?.number, a?.assignee ?? a?.email],
      epicCounts: () => [],
    },
  },
  'workspaceProject.chat': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listChannels',
      create: 'chat.createChannel',
      update: 'chat.updateChannel',
      remove: 'chat.removeChannel',
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.chat.messages': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listMessages',
      create: 'chat.sendMessage',
      update: 'chat.updateMessage',
      remove: 'chat.removeMessage',
      react: 'chat.toggleReaction',
    },
    argMap: {
      // listMessages(channelId, options?) — pull channelId from filter or top-level.
      list: (a) => [a?.channelId ?? a?.filter?.channelId ?? a?.params?.channelId, {
        limit: a?.limit, offset: a?.offset, order: a?.order, ...(a?.options || {})
      }],
      // sendMessage(channelId, payload)
      create: (a) => [a?.channelId ?? a?.filter?.channelId, a?.payload ?? a?.data ?? (() => {
        const { channelId, filter, options, ...rest } = a || {}; return rest
      })()],
      // updateMessage(messageId, payload)
      update: (a) => [a?.id ?? a?.messageId, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.id ?? a?.messageId ?? a],
      react: (a) => [a?.id ?? a?.messageId, a?.emoji, a?.userId],
    },
  },
  'workspaceProject.chat.members': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listMembers',
      create: 'chat.addMember',
      update: 'chat.updateMember',
      remove: 'chat.removeMember',
      markRead: 'chat.markRead',
      mute: 'chat.muteChannel',
    },
    argMap: {
      list: (a) => [a?.channelId ?? a?.filter?.channelId ?? a],
      create: (a) => [a?.channelId, a?.payload ?? { user_id: a?.userId, role: a?.role }],
      update: (a) => [a?.channelId, a?.userId, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.channelId, a?.userId],
      markRead: (a) => [a?.channelId, a?.userId, a?.lastReadAt ?? new Date().toISOString()],
      mute: (a) => [a?.channelId, a?.userId, a?.muted],
    },
  },
  'workspaceProject.chat.mentions': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listMentions',
      // markRead — chat.markMentionsRead(channelId, callerEmail). Bulk-clears
      // every chat_mention row for the caller in one channel.
      markRead: 'chat.markMentionsRead',
    },
    argMap: {
      list: argMaps.filterOptions,
      markRead: (a) => [a?.channelId, a?.callerEmail ?? a?.userId ?? a?.email],
    },
  },
  // Full-text search over chat messages — wraps chat_search_messages RPC.
  // Use sdk.execute('workspaceProject.chat.search', 'rpc', { q, callerEmail }).
  'workspaceProject.chat.search': {
    service: 'workspaceProject',
    methods: { rpc: 'chat.searchMessages' },
    argMap: {
      rpc: (a) => [a?.q ?? a?.query, a?.callerEmail ?? a?.userId ?? a?.email],
    },
  },
  'workspaceProject.calendar': {
    service: 'workspaceProject',
    methods: {
      list: 'calendar.listEvents',
      get: 'calendar.getEvent',
      create: 'calendar.createEvent',
      update: 'calendar.updateEvent',
      remove: 'calendar.deleteEvent',
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.documents': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.list',
      get: 'documents.get',
      create: 'documents.create',
      update: 'documents.update',
      remove: 'documents.remove',
    },
    argMap: {
      list: () => [],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.documents.kb': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.listKb',
      create: 'documents.createKbArticle',
      update: 'documents.updateKbArticle',
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
      update: argMaps.idPayload,
    },
  },
  'workspaceProject.documents.notes': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.listNotes',
      create: 'documents.createNote',
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
    },
  },
  'workspaceProject.documents.userDocuments': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.listUserDocuments',
      create: 'documents.createUserDocument',
      update: 'documents.updateUserDocument',
      remove: 'documents.removeUserDocument',
    },
    argMap: {
      list: (a) => [a?.userId ?? a?.filter?.user_id ?? a?.params?.user_id],
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.documents.resourceLinks': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.listResourceLinks',
      create: 'documents.addResourceLink',
      update: 'documents.updateResourceLink',
      remove: 'documents.removeResourceLink',
      // removeByPair — composite-key delete on (a_type, a_id, b_type, b_id)
      // for unlink paths that don't carry a row id.
      removeByPair: 'documents.removeResourceLinkByPair',
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
      removeByPair: (a) => [a?.filter ?? a],
    },
  },
  'workspaceProject.notifications': {
    service: 'workspaceProject',
    methods: {
      list: 'notifications.list',
      get: 'notifications.unreadCount',
      // create — POSTs a single row through /notifications. Used by
      // shared/functions/notifications/createNotification.js. Bulk
      // (createNotifications) fans out via N create calls until the
      // wrapper exposes a /notifications/bulk endpoint.
      create: 'notifications.create',
      update: 'notifications.markRead',
      markAllRead: 'notifications.markAllRead',
    },
    argMap: {
      list: () => [],
      get: () => [],
      create: argMaps.payload,
      update: argMaps.id,
      markAllRead: () => [],
    },
  },
  'workspaceProject.presence': {
    service: 'workspaceProject',
    methods: { list: 'presence.online', update: 'presence.heartbeat' },
    argMap: { list: () => [], update: argMaps.payload },
  },
  'workspaceProject.people': {
    service: 'workspaceProject',
    methods: {
      list: 'people.list',
      get: 'people.get',
      me: 'people.me',
    },
    argMap: { list: () => [], get: argMaps.id, me: () => [] },
  },
  'workspaceProject.permissions': {
    service: 'workspaceProject',
    methods: { list: 'permissions.me', rpc: 'permissions.check' },
    argMap: {
      list: () => [],
      rpc: (a) => [a?.action, a?.resource],
    },
  },
  'workspaceProject.search': {
    service: 'workspaceProject',
    methods: { rpc: 'search' },
    argMap: { rpc: (a) => [a?.q ?? a?.query, a?.options ?? a] },
  },
  'workspaceProject.activity': {
    service: 'workspaceProject',
    methods: {
      list: 'activity.listNotes',
      create: 'activity.addNote',
      scoringConfig: 'activity.scoringConfig',
      // Bulk PATCH activity_scoring_config rows (admin-only). Replaces the
      // direct sb().from('activity_scoring_config').update().eq() loop.
      updateScoringConfig: 'activity.updateScoringConfig',
      // Heatmap RPC — POST /activity/heatmap with a date-range filter.
      // Returns aggregated counts grouped by occurred_on / activity_type.
      heatmap: 'activity.heatmap',
      // Per-day events list for the heatmap detail drawer.
      listEvents: 'activity.listEvents',
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
      scoringConfig: () => [],
      updateScoringConfig: argMaps.payload,
      heatmap: (a) => [a?.filter ?? a?.params ?? a],
      listEvents: (a) => [a?.filter ?? a?.params ?? a],
    },
  },
  // Sibling route so `fetch: { from: 'workspaceProject.activity.scoringConfig' }`
  // resolves cleanly for the admin scoring page (which expects a `list` op).
  'workspaceProject.activity.scoringConfig': {
    service: 'workspaceProject',
    methods: {
      list: 'activity.scoringConfig',
      update: 'activity.updateScoringConfig',
    },
    argMap: {
      list: () => [],
      update: argMaps.payload,
    },
  },

  // ─── Standups (was sb().from('standup_activity')) ─────────────────────────
  // Daily standup rows keyed on (author, date). Replaces every direct
  // supabase query that used to read/write standup_activity.
  'workspaceProject.standups': {
    service: 'workspaceProject',
    methods: {
      list: 'standups.list',
      get: 'standups.get',
      create: 'standups.create',
      update: 'standups.update',
      // upsert is a separate op so callers don't have to thread an
      // onConflict option through `create`. Maps to the dedicated
      // POST /standups/upsert endpoint server-side.
      upsert: 'standups.upsert',
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params, {
        order: a?.order, limit: a?.limit, ...(a?.options || {})
      }],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      upsert: argMaps.payload,
    },
  },

  // ─── System health / feature flags ────────────────────────────────────────
  // Replaces direct `_probeTable(sb, 'profiles')`-style admin probes from
  // /admin/status. `status` returns aggregated health info; `featureFlags`
  // returns the active flag map.
  'workspaceProject.system': {
    service: 'workspaceProject',
    methods: { status: 'system.status', featureFlags: 'system.featureFlags' },
    argMap: { status: () => [], featureFlags: () => [] },
  },

  // ─── Audit log ────────────────────────────────────────────────────────────
  // Replaces direct sb().from('activity_events') admin reads. Backend wires
  // /workspace/audit-log to the activity_events RLS-scoped view.
  'workspaceProject.auditLog': {
    service: 'workspaceProject',
    methods: { list: 'auditLog.list' },
    argMap: { list: argMaps.filterOptions },
  },

  // ─── Role permissions matrix (governance ACL) ─────────────────────────────
  // Replaces direct sb().from('role_permissions') reads from /admin/permissions.
  'workspaceProject.rolePermissions': {
    service: 'workspaceProject',
    methods: { list: 'rolePermissions.list' },
    argMap: { list: () => [] },
  },

  // ─── Workspace tables that don't yet have a dedicated service namespace.
  // These route through the generic _ws fall-through method on
  // WorkspaceProjectService once that method ships. For now the route is
  // reserved so callers (DOMQL fetch:, sdk.execute) compile against the
  // final entity name and we can flip the implementation under them.
  'workspaceProject.announcements': {
    service: 'workspaceProject',
    methods: {
      list: 'announcements.list',
      get: 'announcements.get',
      create: 'announcements.create',
      update: 'announcements.update',
      remove: 'announcements.remove',
    },
    argMap: CRUD_ARG_MAP,
  },
  'workspaceProject.birthdays': {
    service: 'workspaceProject',
    methods: { list: 'birthdays.list' },
    argMap: { list: () => [] },
  },
  'workspaceProject.stories': {
    service: 'workspaceProject',
    methods: {
      list: 'stories.list',
      get: 'stories.get',
      create: 'stories.create',
      update: 'stories.update',
      remove: 'stories.remove',
    },
    argMap: CRUD_ARG_MAP,
  },
  'workspaceProject.companyInfo': {
    service: 'workspaceProject',
    methods: { list: 'companyInfo.list', update: 'companyInfo.upsert' },
    argMap: { list: () => [], update: argMaps.payload },
  },
  'workspaceProject.companySettings': {
    service: 'workspaceProject',
    methods: { get: 'companySettings.get', update: 'companySettings.update' },
    argMap: { get: () => [], update: argMaps.payload },
  },
  'workspaceProject.userPreferences': {
    service: 'workspaceProject',
    methods: { get: 'userPreferences.get', update: 'userPreferences.upsert' },
    argMap: { get: () => [], update: argMaps.payload },
  },
  'workspaceProject.userGrants': {
    service: 'workspaceProject',
    methods: {
      list: 'userGrants.list',
      get: 'userGrants.get',
      create: 'userGrants.create',
      update: 'userGrants.update',
      remove: 'userGrants.remove',
    },
    argMap: CRUD_ARG_MAP,
  },
  'workspaceProject.valuations': {
    service: 'workspaceProject',
    methods: { list: 'valuations.list' },
    argMap: { list: () => [] },
  },
  'workspaceProject.userProfiles': {
    service: 'workspaceProject',
    methods: {
      list: 'userProfiles.list',
      get: 'userProfiles.get',
      update: 'userProfiles.update',
    },
    argMap: { list: () => [], get: argMaps.id, update: argMaps.idPayload },
  },
  'workspaceProject.ticketColumns': {
    service: 'workspaceProject',
    methods: {
      list: 'ticketColumns.list',
      update: 'ticketColumns.update',
    },
    argMap: { list: () => [], update: argMaps.idPayload },
  },
  'workspaceProject.ticketDependencies': {
    service: 'workspaceProject',
    methods: {
      list: 'ticketDependencies.list',
      create: 'ticketDependencies.create',
      remove: 'ticketDependencies.remove',
    },
    argMap: {
      list: (a) => [a?.ticketId ?? a?.filter?.ticket_id ?? a?.params?.ticket_id],
      create: argMaps.payload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.ticketComments': {
    service: 'workspaceProject',
    methods: {
      list: 'ticketComments.list',
      create: 'ticketComments.create',
      update: 'ticketComments.update',
      remove: 'ticketComments.remove',
    },
    argMap: {
      list: (a) => [a?.ticketId ?? a?.filter?.ticket_id ?? a?.params?.ticket_id, {
        order: a?.order, limit: a?.limit, ...(a?.options || {})
      }],
      create: (a) => [a?.ticketId ?? a?.filter?.ticket_id, a?.payload ?? a?.data ?? a],
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },
  'workspaceProject.meet.rooms': {
    service: 'workspaceProject',
    methods: {
      list: 'meet.listRooms',
      get: 'meet.getRoom',
      create: 'meet.createRoom',
      update: 'meet.updateRoom',
      // endRoom / reopenRoom — explicit ops so callers don't have to thread
      // ended_at through the generic update payload.
      end: 'meet.endRoom',
      reopen: 'meet.reopenRoom',
    },
    argMap: {
      list: () => [],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      end: argMaps.id,
      reopen: argMaps.id,
    },
  },
  'workspaceProject.meet.transcripts': {
    service: 'workspaceProject',
    methods: { list: 'meet.listTranscripts' },
    argMap: { list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a] },
  },
  // Members of a single meet room. Read = list members; create =
  // sb.from('meet_room_members').insert() — the createRoom flow auto-adds
  // the creator as 'owner'. RLS gates inserts to user_id = auth.uid().
  'workspaceProject.meet.members': {
    service: 'workspaceProject',
    methods: {
      list: 'meet.listMembers',
      create: 'meet.addMember',
    },
    argMap: {
      list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a],
      create: (a) => [
        a?.roomId ?? a?.filter?.room_id,
        a?.payload ?? a?.data ?? (() => {
          const { roomId, filter, options, ...rest } = a || {}
          return rest
        })(),
      ],
    },
  },
  // Raw transcribed utterance rows — distinct from the higher-level
  // `meet.transcripts` analysis summaries.
  'workspaceProject.meet.utterances': {
    service: 'workspaceProject',
    methods: { list: 'meet.listUtterances' },
    argMap: { list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a] },
  },
  // Combined utterances + cached analysis view. Wraps the
  // get_meet_transcript_view(uuid) RPC so MeetTranscriptPage's `fetch:`
  // decl can replace the bare RPC handle with an entity route.
  'workspaceProject.meet.transcriptView': {
    service: 'workspaceProject',
    methods: { rpc: 'meet.getTranscriptView' },
    argMap: {
      rpc: (a) => [a?.roomId ?? a?.p_room_id ?? a?.params?.p_room_id ?? a?.filter?.room_id ?? a],
    },
  },
  // Patch applied_items on a meet_transcript_analyses row when the
  // user "applies" a suggestion (saves as note, creates ticket, etc).
  'workspaceProject.meet.analysisAppliedItems': {
    service: 'workspaceProject',
    methods: { update: 'meet.updateAnalysisAppliedItems' },
    argMap: {
      update: (a) => [
        a?.roomId ?? a?.id ?? a?.filter?.room_id,
        a?.applied_items ?? a?.appliedItems ?? a?.payload ?? a?.data,
      ],
    },
  },
  // Pending guest requests across rooms the host owns. Maps to
  // workspaceProject.meet.waitingRoom() — no args (server scopes by
  // host identity from the JWT). Admit/reject ops route to the dedicated
  // /meet/waiting-room/:id/(admit|reject) endpoints.
  'workspaceProject.meet.waitingRoom': {
    service: 'workspaceProject',
    methods: {
      list: 'meet.waitingRoom',
      admit: 'meet.admitGuest',
      reject: 'meet.rejectGuest',
    },
    argMap: {
      list: () => [],
      admit: argMaps.id,
      reject: argMaps.id,
    },
  },
  'workspaceProject.aiChat': {
    service: 'workspaceProject',
    methods: { rpc: 'ai.chat' },
    argMap: { rpc: argMaps.payload },
  },
  // Meet-analyze AI summarization. Mapped to the dedicated server-side
  // ai.meetAnalyze method so consumers don't need to thread `kind` through
  // the generic ai.chat payload. Replaces direct fetch('/functions/v1/meet-analyze').
  'workspaceProject.aiMeetAnalyze': {
    service: 'workspaceProject',
    methods: { rpc: 'ai.meetAnalyze' },
    argMap: { rpc: argMaps.payload },
  },
  // LiveKit token issuance. Replaces direct fetch('/functions/v1/meet-token')
  // — auth threads through the workspace JWT just like every other meet route.
  'workspaceProject.meet.token': {
    service: 'workspaceProject',
    methods: { rpc: 'meet.issueToken' },
    argMap: { rpc: argMaps.payload },
  },
  // ─── Workspace realtime subscriptions ─────────────────────────────────────
  // Each route exposes a single `subscribe` op so callers can use the
  // standard `sdk.execute(entity, 'subscribe', filter, cb)` dispatch.
  // Returns an unsubscribe function. Stubs today; backend wire protocol
  // lands later — call sites use the final shape now so migration is
  // a no-op for them when the protocol ships.
  'workspaceProject.realtime.messages': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeMessages' },
    argMap: { subscribe: (a) => [{ channelId: a?.channelId ?? a?.filter?.channelId }] },
  },
  'workspaceProject.realtime.channels': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeChannels' },
    argMap: { subscribe: (a) => [a?.filter ?? a ?? {}] },
  },
  'workspaceProject.realtime.mentions': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeMentions' },
    argMap: { subscribe: (a) => [{ userEmail: a?.userEmail ?? a?.filter?.userEmail }] },
  },
  'workspaceProject.realtime.tickets': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeTickets' },
    argMap: { subscribe: (a) => [a?.filter ?? a ?? {}] },
  },
  'workspaceProject.realtime.notifications': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeNotifications' },
    argMap: { subscribe: (a) => [{ userEmail: a?.userEmail ?? a?.filter?.userEmail }] },
  },
  'workspaceProject.realtime.presence': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribePresence' },
    argMap: { subscribe: (a) => [{ scope: a?.scope ?? 'workspace' }] },
  },
  'workspaceProject.realtime.meet': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeMeet' },
    argMap: { subscribe: (a) => [{ roomId: a?.roomId ?? a?.filter?.roomId }] },
  },
  'workspaceProject.realtime.agentMessages': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeAgentMessages' },
    argMap: { subscribe: (a) => [{ toAgent: a?.toAgent ?? a?.filter?.toAgent }] },
  },

  // ─── Workspace storage (signed URLs + uploads for contracts, chat-attachments) ─
  // Replaces direct sb().storage.from(...) calls. Buckets are wrapper-scoped,
  // not exposed as public Supabase buckets — the wrapper enforces RLS and
  // hides the bucket service-role key from the browser.
  'workspaceProject.storage': {
    service: 'workspaceProject',
    methods: {
      signedUrl: 'storage.createSignedUrl',
      upload: 'storage.upload',
      remove: 'storage.remove',
      publicUrl: 'storage.publicUrl',
    },
    argMap: {
      signedUrl: (a) => [a?.bucket, a?.path, a?.ttl ?? 300],
      upload: (a) => [a?.bucket, a?.formData ?? a?.payload, a?.options ?? {}],
      remove: (a) => [a?.bucket, a?.path],
      publicUrl: (a) => [a?.bucket, a?.path],
    },
  },

  // Walkie-talkie messages between ops agents (Simona/Chuvaka). The browser
  // path uses sdk.execute(); the node ops path keeps a service-role REST
  // fetch in shared/functions/agentMessages.js because there is no SDK
  // admin token issuance flow yet.
  'workspaceProject.agentMessages': {
    service: 'workspaceProject',
    methods: {
      list: 'agentMessages.list',
      create: 'agentMessages.create',
      update: 'agentMessages.update',
      subscribe: 'agentMessages.subscribe',
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params, {
        order: a?.order, limit: a?.limit, ...(a?.options || {})
      }],
      create: argMaps.payload,
      update: argMaps.idPayload,
      subscribe: (a) => [a?.toAgent ?? a?.filter?.to_agent ?? a?.params?.to_agent],
    },
  },
  // Backwards-compat alias — agentMessages.js currently calls
  // sdk.execute('agent_messages', ...). Keep the bare name routing to the
  // same service methods until consumers update to the dotted form.
  'agent_messages': {
    service: 'workspaceProject',
    methods: {
      list: 'agentMessages.list',
      create: 'agentMessages.create',
      update: 'agentMessages.update',
      subscribe: 'agentMessages.subscribe',
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params, {
        order: a?.order, limit: a?.limit, ...(a?.options || {})
      }],
      create: argMaps.payload,
      update: argMaps.idPayload,
      subscribe: (a) => [a?.toAgent ?? a?.filter?.to_agent ?? a?.params?.to_agent],
    },
  },
  // Generic escape-hatch for one-off RPCs that don't have a dedicated route.
  // sdk.execute('workspaceProject.query', 'rpc', { body }) calls
  // workspaceProject.query(body). Use sparingly — prefer adding a real route.
  'workspaceProject.query': {
    service: 'workspaceProject',
    methods: { rpc: 'query' },
    argMap: { rpc: argMaps.payload },
  },

  // ─── Project (canvas build unit) ──────────────────────────────────────────
  'project': {
    service: 'project',
    methods: {
      list: 'listProjects',
      get: 'getProject',
      create: 'createProject',
      update: 'updateProject',
      remove: 'deleteProject',
    },
  },

  // ─── Branch / PullRequest ─────────────────────────────────────────────────
  'project.branch': {
    service: 'branch',
    methods: { list: 'listBranches', get: 'getBranch', create: 'createBranch', remove: 'deleteBranch' },
  },
  'project.pullRequest': {
    service: 'pullRequest',
    methods: { list: 'list', get: 'get', create: 'create', update: 'update', remove: 'remove' },
  },

  // ─── Collab (canvas project realtime via socket.io) ──────────────────────
  'project.collab': {
    service: 'collab',
    methods: { subscribe: 'subscribe' },
  },

  // ─── Marketplace ──────────────────────────────────────────────────────────
  'marketplace.listings': {
    service: 'marketplace',
    methods: { list: 'list', get: 'get' },
  },

  // ─── File / Screenshot / Misc ─────────────────────────────────────────────
  'file': {
    service: 'file',
    methods: { list: 'list', get: 'get', create: 'upload', remove: 'remove' },
  },
  'screenshot': {
    service: 'screenshot',
    methods: { get: 'getScreenshotByKey' },
  },
}

const resolveDottedMethod = (target, methodPath) => {
  if (!target || !methodPath) return null
  return methodPath.split('.').reduce((obj, key) => obj?.[key], target)
}

// Public: register additional entity routes at runtime.
// Useful for plugins/services that want to expose new entities via sdk.execute
// without modifying this file.
export const registerEntity = (path, route) => {
  if (typeof path !== 'string') throw new Error('[registerEntity] path must be a string')
  if (!route?.service || !route?.methods) {
    throw new Error('[registerEntity] route must have { service, methods }')
  }
  ENTITY_ROUTES[path] = route
}

export const listEntities = () => Object.keys(ENTITY_ROUTES)

// Build an `execute(from, op, args, cb)` function bound to a specific SDK instance.
// Called once during SDK construction; result is attached as `sdk.execute`.
export const createEntityDispatcher = (sdk) => {
  const execute = (from, op, args, cb) => {
    const route = ENTITY_ROUTES[from]
    if (!route) {
      throw new Error(`[sdk.execute] Unknown entity: '${from}'. Known: ${Object.keys(ENTITY_ROUTES).join(', ')}`)
    }
    const methodPath = route.methods[op]
    if (!methodPath) {
      throw new Error(`[sdk.execute] Entity '${from}' does not support op '${op}'. Supported ops: ${Object.keys(route.methods).join(', ')}`)
    }

    let service
    try {
      service = sdk.getService(route.service)
    } catch (err) {
      throw new Error(`[sdk.execute] Service '${route.service}' for entity '${from}' is not available: ${err.message}`)
    }

    const fn = resolveDottedMethod(service, methodPath)
    if (typeof fn !== 'function') {
      throw new Error(`[sdk.execute] Method '${methodPath}' not found on service '${route.service}' (entity '${from}', op '${op}')`)
    }

    // Resolve positional args via the route's argMap if present. Otherwise
    // fall back to passing `args` as a single argument (backwards-compat for
    // services that already accept a single options object).
    const argMapper = route.argMap?.[op]
    const callArgs = typeof argMapper === 'function' ? argMapper(args) : [args]

    // For subscriptions, append the callback as the trailing positional arg
    // so services like `tickets.subscribe(filter, cb)` get (filter, cb).
    if (op === 'subscribe' && typeof cb === 'function') {
      return fn.call(service, ...callArgs, cb)
    }
    return fn.call(service, ...callArgs)
  }

  // Expose introspection helpers on the dispatcher for debugging/tooling.
  execute.listEntities = listEntities
  execute.getRoute = (from) => ENTITY_ROUTES[from] || null

  return execute
}

export default createEntityDispatcher
