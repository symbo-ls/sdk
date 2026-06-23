// EntityDispatcher — single SDK entry point for the fetch plugin's 'sdk' adapter.
//
// Maps dotted entity paths (e.g. 'tickets', 'organization.members')
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

  // Intranet members list — replaces 'workspaceProject.people' (Supabase
  // view). Joins Mongo User identity + workspace-extension/user_profiles
  // HR fields server-side. UI consumers swap `sdk.execute('workspace
  // Project.people', 'list')` → `sdk.execute('users.members', 'list')`.
  'users.members': {
    service: 'auth',
    methods: { list: 'listMembers' },
    argMap: { list: () => [] },
  },

  // ─── Organization (top-level tenant) ──────────────────────────────────────
  'organization': {
    service: 'organization',
    methods: { list: 'list', get: 'get', create: 'create', update: 'update', remove: 'remove' },
  },
  // Namespaced delete entry — sdk.execute('organizations', 'delete', args).
  // Supports mode/dryRun/cascade opts per ticket #4588 spec.
  // Plural alias 'organizations' matches the spec's sdk.organizations.delete(orgId, opts) form.
  'organizations': {
    service: 'organization',
    methods: { delete: 'deleteOrganization' },
    argMap: {
      delete: (a) => [
        a?.id ?? a?.orgId,
        {
          mode: a?.mode,
          dryRun: a?.dryRun,
          cascade: a?.cascade
        }
      ]
    }
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

  // ─── Tickets (TicketService — Mongo-backed, SSE realtime) ────────────────
  // The tickets surface lives on its own service. Workspace UI calls go
  // through `sdk.execute('tickets', 'list')` / `sdk.tickets.*`. The legacy
  // `workspaceProject.tickets*` and `workspaceProject.realtime.tickets`
  // dispatcher routes were dropped in Phase 4 (SDK-TICKETS-BACKCOMPAT-DROP);
  // every consumer now talks to TicketService directly.
  'tickets': {
    service: 'tickets',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      assign: 'assign',
      epicCounts: 'epicCounts',
    },
    argMap: {
      ...CRUD_ARG_MAP,
      assign: (a) => [a?.id ?? a?.number, a?.assignee ?? a?.email],
      epicCounts: () => [],
    },
  },
  'tickets.columns': {
    service: 'tickets',
    methods: {
      list: 'columns.list',
      update: 'columns.update',
    },
    argMap: { list: () => [], update: argMaps.idPayload },
  },
  'tickets.comments': {
    service: 'tickets',
    methods: {
      list: 'comments.list',
      create: 'comments.create',
      update: 'comments.update',
      remove: 'comments.remove',
    },
    argMap: CRUD_ARG_MAP,
  },

  // Release coordination (workspace + server + sdk). Two-stage flow on
  // the /tickets/release UI:
  //   listForStaging — tickets queued for main→release promotion
  //   listForProd    — tickets queued for `gh release create`
  //   list           — past releases (history)
  //   create         — cut a prod release (payload: { repos[], owner, notes })
  'tickets.release': {
    service: 'tickets',
    methods: {
      list: 'release.list',
      listForStaging: 'release.listForStaging',
      listForProd: 'release.listForProd',
      create: 'release.create',
      promoteToStaging: 'release.promoteToStaging',
    },
    argMap: {
      list: (a) => [a || {}],
      listForStaging: (a) => [a || {}],
      listForProd: (a) => [a || {}],
      create: (a) => [a || {}],
      promoteToStaging: (a) => [a || {}],
    },
  },

  // Roadmap planning cycles. Surfaced on /tickets/roadmap. Tickets attach
  // to a cycle via Ticket.cycleId (mirrors releaseId). Mutating ops are
  // gated server-side to ORG_MGMT_ROLES.
  'tickets.cycle': {
    service: 'tickets',
    methods: {
      list: 'cycle.list',
      get: 'cycle.get',
      create: 'cycle.create',
      update: 'cycle.update',
      activate: 'cycle.activate',
      archive: 'cycle.archive',
      listTickets: 'cycle.listTickets',
      addTicket: 'cycle.addTicket',
      removeTicket: 'cycle.removeTicket',
    },
    argMap: {
      list: (a) => [a || {}],
      get: (a) => [a?.cycleId ?? a?.id ?? a],
      create: (a) => [a?.payload ?? a],
      update: (a) => [a?.cycleId ?? a?.id, a?.payload ?? a],
      activate: (a) => [a?.cycleId ?? a?.id ?? a],
      archive: (a) => [a?.cycleId ?? a?.id ?? a],
      listTickets: (a) => [a?.cycleId ?? a?.id ?? a],
      addTicket: (a) => [a?.cycleId ?? a?.id, a?.ticketId],
      removeTicket: (a) => [a?.cycleId ?? a?.id, a?.ticketId],
    },
  },

  // ─── ResourceLinks (junction table, Mongo-backed) ───────────────────────────
  // Cross-resource associations between chat_channel / meet_room /
  // calendar_event rows. Pure flat shape; canonical ordering enforced
  // server-side. UI calls go through `sdk.execute('resourceLinks', 'list')`.
  'resourceLinks': {
    service: 'resourceLinks',
    methods: {
      list: 'list',
      create: 'create',
      remove: 'remove',
      removeByPair: 'removeByPair',
    },
    argMap: {
      list: (a) => [a?.filter ?? a ?? {}],
      create: (a) => [a?.payload ?? a],
      remove: argMaps.id,
      removeByPair: (a) => [a?.payload ?? a],
    },
  },

  // ─── Docs (DocService — Mongo-backed, SSE realtime) ─────────────────────────
  // The docs surface lives on its own service. UI calls go through
  // `sdk.execute('docs', 'list')` / `sdk.docs.*`.
  // `workspaceProject.documents.*` dispatcher routes and back-compat aliases
  // on WorkspaceProjectService delegate here for one cutover cycle (Phase 2).
  'docs': {
    service: 'docs',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      tree: 'tree',
      folders: 'folders',
    },
    argMap: {
      ...CRUD_ARG_MAP,
      tree: argMaps.id,
      folders: () => [],
    },
  },

  // ─── AI Chat (AiChatService — Mongo-backed assistant) ─────────────────────
  // Replaces the workspaceProject.aiChat Supabase edge-function surface.
  // /core/ai-chat/* on the main API server. Threads + messages persist in
  // ai_chat_threads / ai_chat_messages collections.
  'aiChat.threads': {
    service: 'aiChat',
    methods: {
      list: 'threads.list',
      get: 'threads.get',
      create: 'threads.create',
      remove: 'threads.remove',
    },
    argMap: {
      list: (a) => [{ includeArchived: a?.includeArchived ?? a?.filter?.includeArchived ?? false }],
      get: argMaps.id,
      create: argMaps.payload,
      remove: argMaps.id,
    },
  },
  'aiChat.messages': {
    service: 'aiChat',
    methods: { list: 'messages.list' },
    argMap: {
      list: (a) => [a?.threadId ?? a?.id ?? a?.filter?.threadId, {
        limit: a?.limit ?? a?.options?.limit,
        beforeId: a?.beforeId ?? a?.options?.beforeId,
      }],
    },
  },
  'aiChat.completion': {
    service: 'aiChat',
    methods: { rpc: 'completion' },
    argMap: { rpc: argMaps.payload },
  },
  'aiChat.meetAnalyze': {
    service: 'aiChat',
    methods: { rpc: 'meetAnalyze' },
    argMap: { rpc: argMaps.payload },
  },
  // ─── Analyzed (AnalyzedService — Mongo-backed visitor telemetry) ────────────
  // /core/analyzed/* on the main API server. Peer to sdk.docs / sdk.tickets.
  // Replaces the workspaceProject.analyzed* Supabase surface — see
  // architecture/MODEL.md §"Visitor telemetry — Mongo migration".
  'analyzed': {
    service: 'analyzed',
    methods: {
      ingest: 'ingest',
      ingestPublic: 'ingestPublic',
      listSessions: 'listSessions',
      getSession: 'getSession',
      listEvents: 'listEvents',
      listUsers: 'listUsers',
      listBugs: 'listBugs',
    },
    argMap: {
      ingest: (a) => [a],
      ingestPublic: (a) => [a?.envelope ?? a, a?.signature],
      listSessions: (a) => [a?.filter ?? {}, a?.options ?? {}],
      getSession: argMaps.id,
      listEvents: (a) => [a?.filter ?? {}, a?.options ?? {}],
      listUsers: (a) => [a?.filter ?? {}, a?.options ?? {}],
      listBugs: (a) => [a?.filter ?? {}, a?.options ?? {}],
    },
  },
  'docs.documents': {
    service: 'docs',
    methods: {
      list: 'documents.list',
      get: 'documents.get',
      create: 'documents.create',
      update: 'documents.update',
    },
    argMap: CRUD_ARG_MAP,
  },
  'docs.kbArticles': {
    service: 'docs',
    methods: {
      list: 'kbArticles.list',
      get: 'kbArticles.get',
      create: 'kbArticles.create',
      update: 'kbArticles.update',
      children: 'kbArticles.children',
    },
    argMap: {
      ...CRUD_ARG_MAP,
      children: argMaps.id,
    },
  },
  'docs.notes': {
    service: 'docs',
    methods: {
      list: 'notes.list',
      get: 'notes.get',
      create: 'notes.create',
      update: 'notes.update',
    },
    argMap: CRUD_ARG_MAP,
  },
  'docs.userDocs': {
    service: 'docs',
    methods: {
      list: 'userDocs.list',
      get: 'userDocs.get',
      create: 'userDocs.create',
      update: 'userDocs.update',
    },
    argMap: CRUD_ARG_MAP,
  },

  // ─── Workspace Project (activity — chat, calendar, etc.) ─────────
  // Each workspaceProject service method takes positional args
  // (filter, options) / (id) / (id, payload) etc., so every route below
  // gets a CRUD argMap so sdk.execute() can fan adapter args out correctly.
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
  'workspaceProject.chat.members': {
    service: 'workspaceProject',
    methods: {
      // listMembers(channelId?) — undefined channelId routes to bulk GET /chat/members
      list: 'chat.listMembers',
      create: 'chat.addMember',
      update: 'chat.updateMember',
      remove: 'chat.removeMember',
      markRead: 'chat.markRead',
      mute: 'chat.muteChannel',
    },
    argMap: {
      // Pass channelId (possibly undefined) — service routes to bulk or per-channel
      list: (a) => [a?.channelId ?? a?.filter?.channelId],
      create: (a) => [a?.channelId, a?.payload ?? { user_id: a?.userId, role: a?.role }],
      update: (a) => [a?.channelId, a?.userId, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.channelId, a?.userId],
      markRead: (a) => [a?.channelId, a?.userId, a?.lastReadAt ?? new Date().toISOString()],
      mute: (a) => [a?.channelId, a?.userId, a?.muted],
    },
  },
  'workspaceProject.chat.messages': {
    service: 'workspaceProject',
    methods: {
      // listMessages(channelId?, options?) — undefined channelId routes to bulk GET /chat/messages
      list: 'chat.listMessages',
      create: 'chat.sendMessage',
      update: 'chat.updateMessage',
      remove: 'chat.removeMessage',
      react: 'chat.toggleReaction',
    },
    argMap: {
      // Pass channelId (possibly undefined) — service routes to bulk or per-channel
      list: (a) => [
        a?.channelId ?? a?.filter?.channelId ?? a?.params?.channelId,
        { single: a?.single, limit: a?.limit, offset: a?.offset, order: a?.order, ...(a?.options || {}) }
      ],
      create: (a) => [a?.channelId ?? a?.filter?.channelId, a?.payload ?? a?.data ?? (() => {
        const { channelId, filter, options, ...rest } = a || {}; return rest
      })()],
      update: (a) => [a?.messageId ?? a?.id, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.messageId ?? a?.id],
      react: (a) => [a?.messageId ?? a?.id, a?.emoji, a?.userId],
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
      // upsert routes through the workspace PostgREST passthrough rather
      // than the worker /calendar/events endpoint — keeps the on_conflict
      // column list caller-controlled (default 'id'; google-sync writers
      // pass 'google_calendar_id,google_event_id').
      upsert: 'calendar.upsertEvent',
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
      upsert: (a) => [a?.payload ?? a?.data ?? a, a?.onConflict],
    },
  },
  // workspaceProject.documents{,.kb,.notes,.userDocuments,.resourceLinks}
  // were removed 2026-05-19. The docs surface migrated from
  // workspace-project's Supabase passthrough to Mongo-backed DocService.
  // Consumers route through the canonical `docs.*` entities
  // (`docs`, `docs.documents`, `docs.kbArticles`, `docs.notes`,
  // `docs.userDocs`) + `resourceLinks` standalone. Workspace UI was
  // verified migrated before drop (grep workspace/packages — only
  // historical "Migrated ..." comments remained).
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

  // workspaceProject.rolePermissions entity removed — dead SDK surface with
  // zero callers (the /admin/permissions UI retired the role_permissions
  // fetch). The role_permissions TABLE is not dropped (still read by the
  // curated GET /admin/role-permissions route); see migration 0159.

  // ─── Analyzed (observability) ──────────────────────────────────────────────
  // Replaces Grafana Faro. Browser → workspace-project worker →
  // analyzed_* tables. Writes use the curated POST /analyzed/ingest route
  // (server-stamps workspace_id from the JWT); reads use the PostgREST
  // passthrough with RLS gating by app_metadata.workspace_id.
  // SERVER-LOGS-MONGO-MIGRATION Phase 5 — legacy `workspaceProject.analyzed*`
  // entities are deprecated aliases that delegate to the new top-level
  // `sdk.analyzed.*` service (main API server, Mongo-backed). Same pattern
  // sdk.docs / sdk.tickets used. UI code stays untouched during the rolling
  // deploy; each call site migrates from the alias to canonical
  // `sdk.execute('analyzed', 'listSessions', …)` at its own pace. Drop these
  // entries entirely once all callers have migrated.
  'workspaceProject.analyzed': {
    service: 'analyzed',
    methods: { ingest: 'ingest' },
    argMap: { ingest: (a) => [a] },
  },
  'workspaceProject.analyzedSessions': {
    service: 'analyzed',
    methods: {
      list: 'listSessions',
      get:  'getSession',
    },
    argMap: {
      list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}],
      get:  argMaps.id,
    },
  },
  'workspaceProject.analyzedEvents': {
    service: 'analyzed',
    methods: { list: 'listEvents' },
    argMap: { list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}] },
  },
  'workspaceProject.analyzedUserSummaries': {
    service: 'analyzed',
    methods: { list: 'listUsers' },
    argMap: { list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}] },
  },
  'workspaceProject.analyzedBugs': {
    service: 'analyzed',
    methods: { list: 'listBugs' },
    argMap: {
      // Legacy callers send a flat bag (workspaceId/appKey/since/limit/offset).
      // The new server-side bugs route reads filter.{projectId,since} +
      // options.{limit,offset} from the query string; workspaceId/appKey
      // are derived from the auth context. Normalize the legacy shape.
      list: (a) => [
        {
          projectId: a?.appKey ?? a?.filter?.appKey ?? a?.params?.appKey,
          since:     a?.since  ?? a?.filter?.since  ?? a?.params?.since,
        },
        {
          limit:  a?.limit  ?? a?.filter?.limit  ?? a?.params?.limit  ?? 200,
          offset: a?.offset ?? a?.filter?.offset ?? a?.params?.offset ?? 0,
        },
      ],
    },
  },

  // ─── Workspace tables that don't yet have a dedicated service namespace.
  // These route through the generic _ws fall-through method on
  // WorkspaceProjectService once that method ships. For now the route is
  // reserved so callers (DOMQL fetch:, sdk.execute) compile against the
  // final entity name and we can flip the implementation under them.
  // Announcements — DORMANT Supabase → Mongo cutover. The route is STATIC; the
  // engine choice (byte-identical /sb passthrough vs new Mongo /core path) lives
  // inside WorkspaceProjectService.announcements behind _useCoreAnnouncements()
  // (context.useCoreAnnouncements / globalThis.__USE_CORE_ANNOUNCEMENTS__).
  // Default OFF → no behavior change. The `react` op (toggle a reactor on one
  // emoji) is Mongo-only — it resolves to a no-op off-flag, so the historical
  // local-only IntranetRows reaction behavior is preserved in the default path.
  'workspaceProject.announcements': {
    service: 'workspaceProject',
    methods: {
      list: 'announcements.list',
      get: 'announcements.get',
      create: 'announcements.create',
      update: 'announcements.update',
      remove: 'announcements.remove',
      react: 'announcements.toggleReaction',
    },
    argMap: {
      ...CRUD_ARG_MAP,
      react: (a) => [a?.id ?? a?.number, a?.emoji, a?.reactor],
    },
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
  'workspaceProject.fileCanvas': {
    service: 'workspaceProject',
    methods: {
      list: 'fileCanvas.list',
      get: 'fileCanvas.get',
      create: 'fileCanvas.create',
      update: 'fileCanvas.update',
      remove: 'fileCanvas.remove',
    },
    argMap: CRUD_ARG_MAP,
  },
  // Generic record store backing AI-generated extensions (migration 0163,
  // table workspace_records). Standard CRUD; the `collection` namespace rides
  // in the list filter (records.list({ filter: { collection: 'policies' } })).
  'workspaceProject.records': {
    service: 'workspaceProject',
    methods: {
      list: 'records.list',
      get: 'records.get',
      create: 'records.create',
      update: 'records.update',
      remove: 'records.remove',
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
  // PREFS trio — DORMANT Supabase → Mongo cutover. These routes are STATIC; the
  // engine choice (byte-identical /sb passthrough vs new Mongo /core/prefs path)
  // lives inside WorkspaceProjectService.{userPreferences,homeDashboardPrefs,
  // workspaceDashboardDefaults} behind _useCorePrefs() (context.useCorePrefs /
  // globalThis.__USE_CORE_PREFS__). Default OFF → no behavior change. The
  // serialized wire shape is byte-identical either way, so the dispatcher's
  // update→upsert mapping + payload argMap are unchanged.
  'workspaceProject.userPreferences': {
    service: 'workspaceProject',
    methods: { get: 'userPreferences.get', update: 'userPreferences.upsert' },
    argMap: { get: () => [], update: argMaps.payload },
  },
  'workspaceProject.homeDashboardPrefs': {
    service: 'workspaceProject',
    methods: { get: 'homeDashboardPrefs.get', update: 'homeDashboardPrefs.upsert' },
    argMap: { get: () => [], update: argMaps.payload },
  },
  'workspaceProject.workspaceDashboardDefaults': {
    service: 'workspaceProject',
    methods: {
      get: 'workspaceDashboardDefaults.get',
      update: 'workspaceDashboardDefaults.upsert',
    },
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
  // workspaceProject.aiChat + workspaceProject.aiMeetAnalyze retired
  // 2026-05-20 — ALL AI inference moved off Supabase. Callers use
  // sdk.aiChat.{completion,stream,meetAnalyze} (Mongo-backed; LLM
  // routed through Symbols Service Railway proxy for free-text and
  // Gemini direct with responseSchema for structured-JSON). See
  // sdk/src/services/AiChatService.js + the 'aiChat.*' entries above.
  // LiveKit token issuance. Replaces direct fetch('/functions/v1/meet-token')
  // — auth threads through the workspace JWT just like every other meet route.
  'workspaceProject.meet.token': {
    service: 'workspaceProject',
    methods: { rpc: 'meet.issueToken' },
    argMap: { rpc: argMaps.payload },
  },
  // #2226 — owner remote-mute. mute({ roomId, participantIdentity, trackSid,
  // muted }) → worker /meet/mute → meet-mute edge fn → LiveKit.
  'workspaceProject.meet.mute': {
    service: 'workspaceProject',
    methods: { mute: 'meet.mute' },
    argMap: { mute: argMaps.payload },
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
    // Forward roomId, workspaceId AND tables — the SSE transport needs the
    // room/workspace scope to fan out the change stream and the kind set so
    // the consumer only receives the kinds it asked for. (Previously dropped
    // `tables`, which is why some pages silently re-defaulted the kind set —
    // spec §4.2 / §1.4.)
    argMap: {
      subscribe: (a) => [{
        roomId: a?.roomId ?? a?.filter?.roomId,
        workspaceId: a?.workspaceId ?? a?.filter?.workspaceId,
        tables: a?.tables ?? a?.filter?.tables,
      }],
    },
  },
  // workspaceProject.realtime.agentMessages removed — agent_messages table
  // dropped in migration 0159; the agentMessages SDK surface had zero callers.

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

  // workspaceProject.agentMessages + the bare 'agent_messages' back-compat
  // alias removed — agent_messages table dropped in migration 0159; the
  // SDK surface (WorkspaceProjectService.agentMessages) had zero live callers
  // and the referenced shared/functions/agentMessages.js never existed.

  // ─── Community feed + follow graph ────────────────────────────────────────
  // Backed by migration 0106_community_feed.sql. Tables are read-public and
  // write-scoped to the caller's email via RLS. Routes thread through the
  // workspace passthrough; argMap follows the same CRUD shape used elsewhere.

  'workspaceProject.feed': {
    service: 'workspaceProject',
    methods: {
      list: 'feed.list',
      get: 'feed.get',
      create: 'feed.create',
      update: 'feed.update',
      remove: 'feed.remove',
    },
    argMap: CRUD_ARG_MAP,
  },

  'workspaceProject.feed.likes': {
    service: 'workspaceProject',
    methods: {
      list: 'feed.likes.list',
      create: 'feed.likes.create',
      remove: 'feed.likes.remove',
    },
    argMap: {
      list: (a) => [a?.postId ?? a?.post_id ?? a?.filter?.post_id],
      create: (a) => [
        a?.postId ?? a?.post_id ?? a?.payload?.post_id,
        a?.userEmail ?? a?.user_email ?? a?.payload?.user_email,
      ],
      remove: argMaps.id,
    },
  },

  'workspaceProject.feed.comments': {
    service: 'workspaceProject',
    methods: {
      list: 'feed.comments.list',
      create: 'feed.comments.create',
      update: 'feed.comments.update',
      remove: 'feed.comments.remove',
    },
    argMap: {
      list: (a) => [
        a?.postId ?? a?.post_id ?? a?.filter?.post_id,
        { order: a?.order, limit: a?.limit, ...(a?.options || {}) },
      ],
      create: (a) => [
        a?.postId ?? a?.post_id ?? a?.payload?.post_id,
        a?.payload ?? a?.data ?? a,
      ],
      update: argMaps.idPayload,
      remove: argMaps.id,
    },
  },

  'workspaceProject.follows': {
    service: 'workspaceProject',
    methods: {
      list: 'follows.list',
      create: 'follows.create',
      remove: 'follows.remove',
      // Custom op for the (follower, followee) tuple convenience helper.
      removePair: 'follows.removeByPair',
    },
    argMap: {
      list: argMaps.filterOptions,
      create: (a) => [
        a?.followerEmail ?? a?.follower_email ?? a?.payload?.follower_email,
        a?.followeeEmail ?? a?.followee_email ?? a?.payload?.followee_email,
      ],
      remove: argMaps.id,
      removePair: (a) => [
        a?.followerEmail ?? a?.follower_email,
        a?.followeeEmail ?? a?.followee_email,
      ],
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

  // ─── Canvas layout (workspace-level, Mongo-backed) ────────────────────────
  // Replaces per-project setProjectValue(_, ['canvasPosition'], …) +
  // getProjectData catch-up fetches with O(1) workspace-scoped reads/writes.
  // Server contract: GET/PATCH /workspaces/:wsId/canvas-layout.
  // Socket: 'canvas-layout-changed' on the user-socket workspace channel.
  'canvasLayout': {
    service: 'canvasLayout',
    methods: {
      get: 'getCanvasLayout',
      patch: 'patchCanvasLayout',
      subscribe: 'subscribeWorkspaceCanvasLayout',
    },
    argMap: {
      get: (a) => [a?.workspaceId ?? a?.id ?? a],
      patch: (a) => [a?.workspaceId ?? a?.id, a?.payload ?? (() => {
        const { workspaceId, id, ...rest } = a || {}
        return rest
      })()],
      subscribe: (a) => [a?.workspaceId ?? a?.id ?? a],
    },
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
