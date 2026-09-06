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
// Keys of the list args bag that are NOT filter fields: the two filter packs
// themselves + the pagination/shape options filterOptions splits out.
const LIST_OPTION_KEYS = [
  'filter',
  'params',
  'options',
  'single',
  'limit',
  'offset',
  'order'
]

const argMaps = {
  // (filter, options) for list — splits the adapter's params/options bag.
  //
  // FLAT-ARGS CONTRACT (2026-07-23): callers routinely pass filter fields
  // flat — `execute('parties', 'list', { kind: 'company', workspaceId })` —
  // and the old `a?.filter ?? a?.params` read silently DROPPED every one of
  // them: the service got `filter = undefined`, the request went out
  // unscoped, and the server's active-workspace claim fallback answered for
  // whichever workspace was last active — an empty (or wrong-tenant) result
  // that reads as "no data" to both humans and the AI assistant. Flat keys
  // now BECOME the filter (minus LIST_OPTION_KEYS); an explicit `filter` /
  // `params` pack still wins unchanged. `workspaceId` — a routing param —
  // additionally rides on the options bag in BOTH shapes, so services that
  // read `filter.workspaceId || options.workspaceId` resolve it even when
  // it sits next to a nested filter pack.
  filterOptions: (a) => {
    const bag = a && typeof a === 'object' && !Array.isArray(a) ? a : {}
    const rest = {}
    for (const k in bag) {
      if (!LIST_OPTION_KEYS.includes(k)) rest[k] = bag[k]
    }
    const filter =
      bag.filter ?? bag.params ?? (Object.keys(rest).length ? rest : undefined)
    return [
      filter,
      {
        single: bag.single,
        limit: bag.limit,
        offset: bag.offset,
        order: bag.order,
        ...(bag.workspaceId !== undefined
          ? { workspaceId: bag.workspaceId }
          : {}),
        ...(bag.options || {})
      }
    ]
  },
  // (id) for get/remove — accepts id, number, or the bare arg.
  id: (a) => [a?.id ?? a?.number ?? a],
  // (payload) for create — payload may live under .payload, .data, or be the bare arg.
  payload: (a) => [a?.payload ?? a?.data ?? a],
  // (id, payload) for update — id pulled like .id helper, payload like .payload helper.
  idPayload: (a) => [
    a?.id ?? a?.number,
    a?.payload ??
      a?.data ??
      (() => {
        const { id, number, ...rest } = a || {}
        return rest
      })()
  ]
}

const CRUD_ARG_MAP = {
  list: argMaps.filterOptions,
  get: argMaps.id,
  create: argMaps.payload,
  update: argMaps.idPayload,
  remove: argMaps.id
}

// Workspace-scoped CRUD adapters — the Phase-2/3/4 entity services share ONE
// uniform signature (get/remove `(id, { workspaceId })`, create `(payload,
// { workspaceId })`, update `(id, payload, { workspaceId })`), so their routes
// thread a caller's top-level `workspaceId` — a ROUTING param, never body —
// into that trailing options positional, and strip it out of a flat create/
// update body. The opts positional is emitted ONLY when the caller provided
// workspaceId: without it every arg array is byte-identical to CRUD_ARG_MAP,
// and legacy routes (tickets etc.), whose trailing positionals mean other
// things (e.g. a hard-delete flag), keep using CRUD_ARG_MAP untouched.
const _wsOpts = (a) =>
  a && typeof a === 'object' && a.workspaceId !== undefined
    ? [{ workspaceId: a.workspaceId }]
    : []
const _stripWs = (a, extraKeys) => {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return a
  const rest = {}
  for (const k in a) {
    if (k !== 'workspaceId' && !(extraKeys && extraKeys.includes(k)))
      rest[k] = a[k]
  }
  return rest
}
const wsArgMaps = {
  id: (a) => [a?.id ?? a?.number ?? a, ..._wsOpts(a)],
  payload: (a) => [a?.payload ?? a?.data ?? _stripWs(a), ..._wsOpts(a)],
  idPayload: (a) => [
    a?.id ?? a?.number,
    a?.payload ?? a?.data ?? _stripWs(a, ['id', 'number']),
    ..._wsOpts(a)
  ]
}

const WS_CRUD_ARG_MAP = {
  list: argMaps.filterOptions,
  get: wsArgMaps.id,
  create: wsArgMaps.payload,
  update: wsArgMaps.idPayload,
  remove: wsArgMaps.id
}

// RECORDS ARG MAP — the generic maps above cannot serve this entity.
//
// `wsArgMaps.payload` resolves the request body as
// `a?.payload ?? a?.data ?? rest`. That `a?.data` branch exists because most
// entities let a caller pack the body as `{ data: {...} }`. The records plane
// is the one entity where `data` is a FIRST-CLASS FIELD of the body itself —
// the wire shape is `{ collection, name, data }` — so on a flat write the
// heuristic fires on the record's own payload and returns just that, silently
// dropping `collection` and `name` before the request is built. The server
// then rejects it with "A `collection` namespace is required", which reads as
// a caller mistake and is really an unpacking bug three layers up. Symptom
// when it bit: workspace-module board autosave failing on every create, and
// row create/update on the workspace `/data` surface (`externalData.js`)
// failing the same way — both pass the documented flat shape.
//
// The packed form (`{ payload: {...} }`) is still honoured; only the `data`
// shortcut is dropped, and only here.
const recordsBody = (a, extraKeys) => a?.payload ?? _stripWs(a, extraKeys)

const RECORDS_ARG_MAP = {
  list: argMaps.filterOptions,
  get: wsArgMaps.id,
  create: (a) => [recordsBody(a), ..._wsOpts(a)],
  update: (a) => [
    a?.id ?? a?.number,
    recordsBody(a, ['id', 'number']),
    ..._wsOpts(a)
  ],
  remove: wsArgMaps.id,
  // (filter, cb) — the dispatcher appends the callback for subscribe ops.
  subscribe: (a) => [a || {}]
}

// Bookmarks has one non-CRUD operation: enrich a composing URL. It keeps the
// workspace routing pin in the trailing options positional like records while
// forwarding the compact `{ url }` body unchanged. This is intentionally not a
// generic RPC escape hatch — the server route is explicit and first-party.
const BOOKMARKS_ARG_MAP = {
  enrich: (a) => [a?.payload ?? a?.data ?? _stripWs(a), ..._wsOpts(a)]
}

// Party sub-resource body adapter (roles / relationships). Pulls the POST
// body out of the well-known shapes, stripping the parent-id keys so both a
// packed caller (`{ partyId, payload: { role } }`) and a flat caller
// (`{ partyId, role, ... }`) yield the right body. Mirrors argMaps.idPayload's
// rest-strip, keyed on the party's partyId/id instead of id/number.
const partySubPayload = (a) =>
  a?.payload ??
  a?.data ??
  (() => {
    // workspaceId is a routing param (→ `?workspaceId=`), never role/edge body —
    // strip it here so the sub-resource argMaps can forward it as the opts arg.
    const { partyId, id, workspaceId, ...rest } = a || {}
    return rest
  })()

// Conversation message body adapter (Phase-4 §6.7). Same shape-tolerance as
// partySubPayload, keyed on the thread's conversationId/id instead — so both a
// packed caller (`{ conversationId, payload: { body } }`) and a flat caller
// (`{ conversationId, direction, body, ... }`) yield the right POST body.
const conversationMessagePayload = (a) =>
  a?.payload ??
  a?.data ??
  (() => {
    const { conversationId, id, ...rest } = a || {}
    return rest
  })()

// §7 spine-capability list adapter. The entity-scoped lists (comments,
// attachments, watchers, activityEntries, tags — and watchers' unwatch-by-
// query) read their query params (entityType/entityId, userEmail, since/limit,
// group, workspaceId) off a SINGLE filter bag. Pass that bag through as the
// first positional, tolerating all three caller shapes: the imperative flat
// bag ({ entityType, entityId }), the { filter } pack, and the declarative
// fetch-adapter pack ({ filter: params, params, ...params }). The second
// positional carries the feed/scope fallbacks (workspaceId/since/limit) that
// the fetch adapter hoists OUT of `params` to the top level (e.g. `limit`).
const spineListArgs = (a) => [
  a?.filter ?? a?.params ?? a,
  {
    workspaceId: a?.workspaceId,
    since: a?.since,
    limit: a?.limit,
    ...(a?.options || {})
  }
]

// Mail setup-gate adapter (architecture/MAIL.md §3.2a). The three setup ops
// take NO id and NO body — only the workspace routing pin — so they cannot
// use argMaps.id / argMaps.payload: those would forward the whole caller bag
// as an id (or a body) and the request would go out unscoped. Same dual-shape
// tolerance as the builds/orgIntegration adapters: the imperative bag
// ({ workspaceId }) and the declarative fetch-adapter packs ({ params },
// { filter }) both resolve. Declared BEFORE ENTITY_ROUTES: the route object
// reads this binding while it is built, not at call time.
const mailScopeArgs = (a) => [
  {
    workspaceId:
      a?.workspaceId ?? a?.params?.workspaceId ?? a?.filter?.workspaceId
  }
]

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
    argMap: {
      subscribe: (a) => [
        {
          lang: a?.lang ?? a?.filter?.lang,
          namespace: a?.namespace ?? a?.filter?.namespace
        }
      ]
    }
  },

  // ─── Auth + identity ───────────────────────────────────────────────────────
  'auth.session': {
    service: 'auth',
    methods: { list: 'getSession', subscribe: 'onAuthStateChange' }
  },
  'auth.me': {
    service: 'auth',
    methods: { list: 'getMe', get: 'getMe', update: 'updateMe' }
  },
  'auth.permissions': {
    service: 'auth',
    methods: { list: 'getPermissions' }
  },

  // Intranet members list — replaces 'workspaceProject.people' (Supabase
  // view). Joins Mongo User identity + workspace-extension/user_profiles
  // HR fields server-side. UI consumers swap `sdk.execute('workspace
  // Project.people', 'list')` → `sdk.execute('users.members', 'list')`.
  'users.members': {
    service: 'auth',
    methods: { list: 'listMembers' },
    // Multi-tab: an explicit workspaceId (or the boot-prime's orgSlug)
    // scopes the roster to that tenant's org (membership-verified
    // server-side); absent → the caller's active org, unchanged.
    argMap: {
      list: (a) =>
        a?.workspaceId || a?.orgSlug
          ? [{ workspaceId: a?.workspaceId, orgSlug: a?.orgSlug }]
          : [undefined]
    }
  },

  // ─── Organization (top-level tenant) ──────────────────────────────────────
  organization: {
    service: 'organization',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    }
  },
  // Namespaced delete entry — sdk.execute('organizations', 'delete', args).
  // Supports mode/dryRun/cascade opts per ticket #4588 spec.
  // Plural alias 'organizations' matches the spec's sdk.organizations.delete(orgId, opts) form.
  organizations: {
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
    methods: {
      list: 'listMembers',
      create: 'inviteMember',
      remove: 'removeMember'
    }
  },
  'organization.roles': {
    service: 'organization',
    methods: { list: 'listRoles' }
  },

  // ─── Workspace (build environment / pricing tier) ─────────────────────────
  workspace: {
    service: 'workspace',
    methods: {
      list: 'listWorkspaces',
      get: 'getWorkspace',
      create: 'createWorkspace',
      update: 'updateWorkspace',
      remove: 'deleteWorkspace'
    }
  },
  'workspace.members': {
    service: 'workspace',
    methods: { list: 'listWorkspaceMembers', create: 'addWorkspaceMember' }
  },
  // Member record-scope sub-resource — the records-plane LOCATION axis
  // (server a95cda9f "records: a real HTTP path to read/assign
  // WorkspaceMember.recordScope"; tickets/natali.md "NAT-V1-02"). Distinct
  // entity from 'workspace.members' (same parent/child relationship as
  // 'workspace' → 'workspace.settings' below) so a role PATCH and a
  // recordScope PATCH can never collide on one `update` op. Singleton-
  // per-member shape — get/update (+list, see below), no create/remove —
  // mirrors the `companyProfile` entity's { get, update } singleton pair.
  //   sdk.execute('workspace.members.recordScope', 'get', { workspaceId, userId })
  //   sdk.execute('workspace.members.recordScope', 'update', { workspaceId, userId, recordScope })
  //
  // `list` is ALSO mapped to the same read (not just `get`): the fetch
  // plugin's declarative adapter (@symbo.ls/fetch) only ever emits
  // list/rpc/insert/update/upsert/delete/subscribe — never bare `get` — so
  // a `fetch: [{ from: 'workspace.members.recordScope', method: 'select',
  // params: { workspaceId, userId } }]` declaration would 404 on "does not
  // support op 'list'" without this alias. sdkAdapter's `select` handler
  // passes non-array data through untouched, so returning a single object
  // under `list` is safe — this is the one place this entity intentionally
  // diverges from companyProfile's precedent, so the LOCATION-axis role UI
  // can read a member's own scope on mount purely declaratively.
  'workspace.members.recordScope': {
    service: 'workspace',
    methods: {
      get: 'getWorkspaceMemberRecordScope',
      list: 'getWorkspaceMemberRecordScope',
      update: 'updateWorkspaceMemberRecordScope'
    },
    argMap: {
      get: (a) => [a?.workspaceId, a?.userId],
      list: (a) => [a?.workspaceId, a?.userId],
      // recordScope may be legitimately `null` (clears the assignment) —
      // rest-strip (not `??`-chained) so an explicit null survives and a
      // truly-omitted key still throws service-side, same as
      // partySubPayload's convention below.
      update: (a) => [
        a?.workspaceId,
        a?.userId,
        a?.payload ??
          a?.data ??
          (() => {
            const { workspaceId, userId, ...rest } = a || {}
            return rest
          })()
      ]
    }
  },
  // Merge-safe partial settings write — PATCH /workspaces/:id/settings. The
  // single writer for settings.{workspaceModule,navbar,apps,
  // home_default_panels,designSystem,language,layoutDirection,modules} that
  // deep-merges per key server-side. Distinct from the 'workspace' route's
  // `update` (whole-doc PATCH /workspaces/:id, which whole-bag REPLACES the
  // settings object). Threads the workspace id like the canvasLayout.patch
  // route: id from workspaceId|id; the flat partial-settings object is
  // `.payload` or the remaining bag keys (id/workspaceId stripped).
  //   sdk.execute('workspace.settings', 'update', { workspaceId, navbar, apps })
  //   sdk.execute('workspace.settings', 'update', { workspaceId, payload: { designSystem } })
  'workspace.settings': {
    service: 'workspace',
    methods: { update: 'updateWorkspaceSettings' },
    argMap: {
      update: (a) => [
        a?.workspaceId ?? a?.id,
        a?.payload ??
          (() => {
            const { workspaceId, id, ...rest } = a || {}
            return rest
          })()
      ]
    }
  },

  // ─── Tickets (TicketService — Mongo-backed, SSE realtime) ────────────────
  // The tickets surface lives on its own service. Workspace UI calls go
  // through `sdk.execute('tickets', 'list')` / `sdk.tickets.*`. The legacy
  // `workspaceProject.tickets*` and `workspaceProject.realtime.tickets`
  // dispatcher routes were dropped in Phase 4 (SDK-TICKETS-BACKCOMPAT-DROP);
  // every consumer now talks to TicketService directly.
  tickets: {
    service: 'tickets',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      assign: 'assign',
      epicCounts: 'epicCounts',
      columnCounts: 'columnCounts'
    },
    argMap: {
      ...CRUD_ARG_MAP,
      assign: (a) => [a?.id ?? a?.number, a?.assignee ?? a?.email],
      epicCounts: () => [],
      columnCounts: (a) => [a?.filter ?? a ?? {}]
    }
  },
  'tickets.columns': {
    service: 'tickets',
    methods: {
      list: 'columns.list',
      update: 'columns.update'
    },
    argMap: { list: () => [], update: argMaps.idPayload }
  },
  'tickets.comments': {
    service: 'tickets',
    methods: {
      list: 'comments.list',
      create: 'comments.create',
      update: 'comments.update',
      remove: 'comments.remove'
    },
    argMap: CRUD_ARG_MAP
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
      promoteToStaging: 'release.promoteToStaging'
    },
    argMap: {
      list: (a) => [a || {}],
      listForStaging: (a) => [a || {}],
      listForProd: (a) => [a || {}],
      create: (a) => [a || {}],
      promoteToStaging: (a) => [a || {}]
    }
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
      removeTicket: 'cycle.removeTicket'
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
      removeTicket: (a) => [a?.cycleId ?? a?.id, a?.ticketId]
    }
  },

  // ─── ResourceLinks (junction table, Mongo-backed) ───────────────────────────
  // Cross-resource associations between chat_channel / meet_room /
  // calendar_event rows. Pure flat shape; canonical ordering enforced
  // server-side. UI calls go through `sdk.execute('resourceLinks', 'list')`.
  resourceLinks: {
    service: 'resourceLinks',
    methods: {
      list: 'list',
      create: 'create',
      remove: 'remove',
      removeByPair: 'removeByPair'
    },
    argMap: {
      list: (a) => [a?.filter ?? a ?? {}],
      create: (a) => [a?.payload ?? a],
      remove: argMaps.id,
      removeByPair: (a) => [a?.payload ?? a]
    }
  },

  // ─── Phase-1 spine (WORKSPACE_DATA_MODEL §6.5/§6.8/§7/§8) ────────────────────
  // Top-level Mongo-native entities over the main server's /core/* routes.
  // Declarative `fetch: [{ from: 'workflows', ... }]` + imperative
  // `sdk.execute('proposedActions', 'approve', { id })` both resolve here.
  proposedActions: {
    service: 'proposedActions',
    methods: {
      list: 'list',
      get: 'get',
      create: 'propose',
      approve: 'approve',
      reject: 'reject',
      result: 'setResult'
    },
    argMap: {
      list: argMaps.filterOptions,
      get: argMaps.id,
      create: argMaps.payload,
      approve: argMaps.id,
      reject: argMaps.id,
      result: argMaps.idPayload
    }
  },
  workflows: {
    service: 'workflows',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: CRUD_ARG_MAP
  },
  fieldDefs: {
    service: 'fieldDefs',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: CRUD_ARG_MAP
  },
  recordCollections: {
    service: 'recordCollections',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: CRUD_ARG_MAP
  },

  // ─── Phase-2 directory (WORKSPACE_DATA_MODEL §5) ────────────────────────────
  // The Party Directory: parties (+ roles/relationships sub-resources),
  // interactions (touchpoint log), segments (saved audiences). Mongo-native,
  // peers to the Phase-1 spine. Declarative `fetch: [{ from: 'parties', ... }]`
  // + imperative `sdk.execute('parties', 'addRole', { partyId, role })` both
  // resolve here.
  parties: {
    service: 'parties',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      listRoles: 'listRoles',
      addRole: 'addRole',
      removeRole: 'removeRole',
      listRelationships: 'listRelationships',
      addRelationship: 'addRelationship',
      removeRelationship: 'removeRelationship'
    },
    argMap: {
      ...WS_CRUD_ARG_MAP,
      // Roles/relationships thread the parent partyId first, then the body, then
      // the `{ workspaceId }` opts PartyService forwards to `?workspaceId=`. A
      // member's Party lives in the org's HQ workspace (org-level intranet home,
      // resolveHqWorkspaceId), which differs from the caller's active workspace —
      // so every sub-resource op MUST carry workspaceId or it resolves against
      // the wrong workspace and 404s ("party not found", tickets/server.md).
      // Absent workspaceId → `_qs(undefined)` adds nothing → prior behavior.
      listRoles: (a) => [a?.partyId ?? a?.id, { workspaceId: a?.workspaceId }],
      addRole: (a) => [
        a?.partyId ?? a?.id,
        partySubPayload(a),
        { workspaceId: a?.workspaceId }
      ],
      removeRole: (a) => [
        a?.partyId ?? a?.id,
        a?.role,
        { workspaceId: a?.workspaceId }
      ],
      listRelationships: (a) => [
        a?.partyId ?? a?.id,
        { workspaceId: a?.workspaceId }
      ],
      addRelationship: (a) => [
        a?.partyId ?? a?.id,
        partySubPayload(a),
        { workspaceId: a?.workspaceId }
      ],
      // removeRelationship targets the edge by its own id (relId), not partyId.
      removeRelationship: (a) => [
        a?.relId ?? a?.id,
        { workspaceId: a?.workspaceId }
      ]
    }
  },
  interactions: {
    service: 'interactions',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  segments: {
    service: 'segments',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      members: 'listMembers'
    },
    argMap: {
      ...WS_CRUD_ARG_MAP,
      members: argMaps.id
    }
  },

  // ─── Phase-3 commerce (WORKSPACE_DATA_MODEL §6.2/§6.3/§6.4) ──────────────────
  // The tenant-finance spine: catalog (products + prices), the workspace's own
  // company profile (singleton), agreements, invoices, transactions. Mongo-
  // native, peers to the Phase-1 spine + Phase-2 directory. Declarative
  // `fetch: [{ from: 'invoices', ... }]` + imperative
  // `sdk.execute('invoices', 'issue', { id })` both resolve here.
  products: {
    service: 'products',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  prices: {
    service: 'prices',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  agreements: {
    service: 'agreements',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  invoices: {
    service: 'invoices',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      issue: 'issue'
    },
    argMap: {
      ...WS_CRUD_ARG_MAP,
      // issue transitions draft → open by id (no body).
      issue: argMaps.id
    }
  },
  transactions: {
    service: 'transactions',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  // company-profile is a workspace singleton — no id on get/update; update
  // carries the upsert payload.
  companyProfile: {
    service: 'companyProfile',
    methods: { get: 'get', update: 'update' },
    argMap: { get: () => [], update: argMaps.payload }
  },

  // ─── §7 spine capabilities (WORKSPACE_DATA_MODEL §7.3–§7.6/§6.9) ─────────────
  // The polymorphic surfaces every entity (shared + records) hangs on, keyed
  // on entityRef { type, id }: comments (threaded discussion), attachments
  // (files on anything), watchers (subscribe anyone to anything),
  // activityEntries (the read-only timeline), tags (the workspace tag
  // registry). Mongo-native, peers to the Phase-1 spine + Phase-2 directory +
  // Phase-3 commerce. Declarative `fetch: [{ from: 'comments', params: {
  // entityType, entityId } }]` + imperative `sdk.execute('watchers', 'watch',
  // { entityRef, level })` both resolve here. The entity-scoped lists thread
  // their filter bag via spineListArgs (see the adapter above).
  comments: {
    service: 'comments',
    methods: {
      list: 'list',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    // No `get` — the server exposes no GET /comments/:id (a comment is only
    // read through the entity-scoped list).
    argMap: {
      list: spineListArgs,
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id
    }
  },
  attachments: {
    service: 'attachments',
    methods: { list: 'list', create: 'create', remove: 'remove' },
    argMap: {
      list: spineListArgs,
      create: argMaps.payload,
      remove: argMaps.id
    }
  },
  watchers: {
    service: 'watchers',
    methods: { list: 'list', watch: 'watch', unwatch: 'unwatch' },
    argMap: {
      list: spineListArgs,
      // watch = POST upsert; pass the { entityRef, level, userEmail } payload
      // bag (flat or packed), threading workspaceId to the query.
      watch: (a) => [
        a?.payload ?? a?.data ?? a,
        { workspaceId: a?.workspaceId ?? a?.options?.workspaceId }
      ],
      // unwatch = DELETE by query; pass the { entityType, entityId, userEmail }
      // filter bag — same shape-tolerance as list.
      unwatch: spineListArgs
    }
  },
  activityEntries: {
    service: 'activityEntries',
    // Read-only timeline — list only (emission is server-internal).
    methods: { list: 'list' },
    argMap: { list: spineListArgs }
  },
  tags: {
    service: 'tags',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: {
      ...CRUD_ARG_MAP,
      // list threads the optional { group } filter bag (flat or packed).
      list: spineListArgs
    }
  },

  // ─── Phase-4 scheduling (WORKSPACE_DATA_MODEL §6.5/§6.7/§6.8) ────────────────
  // The scheduling & service surfaces: bookings (party-facing commitments,
  // + confirm + cancel-delete), availabilityRules (per-user freebusy),
  // conversations (two-way threads + a messages sub-resource), recurrences
  // (the generic rrule scheduler). Mongo-native, peers to the Phase-1 spine +
  // Phase-2 directory + Phase-3 commerce + §7 capabilities. Declarative
  // `fetch: [{ from: 'bookings', ... }]` + imperative
  // `sdk.execute('bookings', 'confirm', { id })` /
  // `sdk.execute('conversations', 'addMessage', { conversationId, body })`
  // both resolve here.
  bookings: {
    service: 'bookings',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      confirm: 'confirm'
    },
    argMap: {
      ...WS_CRUD_ARG_MAP,
      // confirm transitions requested → confirmed by id (no body); remove is
      // the cancel DELETE (status 'cancelled', never a hard delete).
      confirm: argMaps.id
    }
  },
  availabilityRules: {
    service: 'availabilityRules',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },
  conversations: {
    service: 'conversations',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      messages: 'listMessages',
      addMessage: 'addMessage'
    },
    argMap: {
      ...WS_CRUD_ARG_MAP,
      // The message sub-resource threads the parent conversationId first, then
      // (for addMessage) the { direction, from, to, body, attachments } body.
      messages: (a) => [a?.conversationId ?? a?.id],
      addMessage: (a) => [
        a?.conversationId ?? a?.id,
        conversationMessagePayload(a)
      ]
    }
  },
  recurrences: {
    service: 'recurrences',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    },
    argMap: WS_CRUD_ARG_MAP
  },

  // ─── Docs (DocService — Mongo-backed, SSE realtime) ─────────────────────────
  // The docs surface lives on its own service. UI calls go through
  // `sdk.execute('docs', 'list')` / `sdk.docs.*`.
  // `workspaceProject.documents.*` dispatcher routes and back-compat aliases
  // on WorkspaceProjectService delegate here for one cutover cycle (Phase 2).
  docs: {
    service: 'docs',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove',
      tree: 'tree',
      folders: 'folders'
    },
    argMap: {
      ...CRUD_ARG_MAP,
      tree: argMaps.id,
      folders: () => []
    }
  },

  // ─── Mail (architecture/MAIL.md §5.2, §7) ───────────────────────────────────
  // The built-in mail client over /core/mail/*. ONLY the routes registered on
  // the server today are routed here — the §3.2a setup gate (incl. the real
  // link), the member account reads/writes + the personal OAuth connect /
  // reconnect / sync-now, the admin health + audit surface, the §5.7 send
  // path ('mail.drafts' + 'mail.outbox', MAIL-SERVER-SEND-OUTBOX-1) and the
  // §5.2/§5.6 read path ('mail.threads' + 'mail.messages',
  // MAIL-SERVER-THREAD-READ-ROUTES-1) and the §3.5 admin tenant + shared
  // surface ('mail.tenant' + 'mail.shared',
  // MAIL-SERVER-TENANT-SHARED-ROUTES-1). §7 named the thread entity bare
  // `mail`; the shipped read UI (workspace/packages/mail) calls
  // 'mail.threads', so that is the registered name.
  //   sdk.execute('mail.setup', 'get', { workspaceId })
  //   sdk.execute('mail.accounts', 'list', { workspaceId })
  //   sdk.execute('mail.accounts', 'update', { id, workspaceId, signature })
  //   sdk.execute('mail.admin', 'audit', { workspaceId, limit: 50 })
  //   sdk.execute('mail.drafts', 'create', { workspaceId, account, to, subject })
  //   sdk.execute('mail.outbox', 'send', { workspaceId, draftId, undoSeconds: 10 })
  //   sdk.execute('mail.threads', 'list', { workspaceId, folder: 'inbox', unread: true, limit: 50 })
  //   sdk.execute('mail.threads', 'update', { id, workspaceId, read: true })
  //   sdk.execute('mail.messages', 'body', { id, workspaceId })
  'mail.setup': {
    service: 'mail',
    methods: {
      get: 'getSetup',
      link: 'setupLink',
      notifyAdmin: 'setupNotifyAdmin'
    },
    // All three take the workspace pin only — no id, no body. `link` answers
    // 501 today (the contract is frozen); `notifyAdmin` answers 429 with a
    // retryAt once per viewer per day.
    argMap: {
      get: mailScopeArgs,
      link: mailScopeArgs,
      notifyAdmin: mailScopeArgs
    }
  },
  'mail.accounts': {
    service: 'mail',
    methods: {
      list: 'listAccounts',
      get: 'getAccount',
      update: 'updateAccount',
      remove: 'disconnectAccount',
      connect: 'startConnect',
      reconnect: 'reconnect',
      sync: 'syncNow'
    },
    // Explicit, not WS_CRUD_ARG_MAP: there is no `create` op — an account is
    // born from the OAuth round trip (`connect` answers the authorize URL,
    // the public callback creates the row) — and `remove` is the disconnect
    // (tombstone), never a hard delete.
    //   sdk.execute('mail.accounts', 'connect', { provider: 'google', workspaceId })
    //   sdk.execute('mail.accounts', 'reconnect', { id, workspaceId })
    //   sdk.execute('mail.accounts', 'sync', { id, workspaceId })
    argMap: {
      list: argMaps.filterOptions,
      get: wsArgMaps.id,
      update: wsArgMaps.idPayload,
      remove: wsArgMaps.id,
      connect: (a) => [a?.provider ?? (typeof a === 'string' ? a : undefined), ..._wsOpts(a)],
      reconnect: wsArgMaps.id,
      sync: wsArgMaps.id
    }
  },
  'mail.drafts': {
    service: 'mail',
    methods: {
      create: 'createDraft',
      update: 'updateDraft',
      remove: 'deleteDraft',
      attach: 'uploadDraftAttachment'
    },
    // No list/get: the server registers none (§5.2 — the composer holds its
    // draft; the OAuth return keeps it client-side). `attach` takes a
    // File/Blob positional the JSON maps cannot shape.
    //   sdk.execute('mail.drafts', 'attach', { id, file, workspaceId })
    argMap: {
      create: wsArgMaps.payload,
      update: wsArgMaps.idPayload,
      remove: wsArgMaps.id,
      attach: (a) => [a?.id, a?.file, ..._wsOpts(a)]
    }
  },
  'mail.outbox': {
    service: 'mail',
    methods: {
      list: 'listOutbox',
      send: 'send',
      cancel: 'cancelSend'
    },
    // `send` consumes a draft into a queued outbox row (202); `cancel` is
    // the undo — 409 not_cancellable once the worker claimed the row.
    //   sdk.execute('mail.outbox', 'list', { workspaceId, status: 'queued' })
    //   sdk.execute('mail.outbox', 'cancel', { id, workspaceId })
    argMap: {
      list: argMaps.filterOptions,
      send: wsArgMaps.payload,
      cancel: wsArgMaps.id
    }
  },
  'mail.threads': {
    service: 'mail',
    methods: {
      list: 'listThreads',
      get: 'getThread',
      update: 'updateThread',
      batch: 'batchThreads'
    },
    // list: flat keys become the filter (folder, label, unread, starred,
    // attachments, from, q, cursor) and `limit` rides the options bag —
    // listThreads reads both. update strips the routing pin from the flag
    // body; batch is a body ({ ids, ...flags }) with the pin in the options.
    //   sdk.execute('mail.threads', 'list', { workspaceId, accountId: 'all', folder: 'inbox', cursor })
    //   sdk.execute('mail.threads', 'get', { id, workspaceId })
    //   sdk.execute('mail.threads', 'update', { id, workspaceId, folder: 'archive' })
    //   sdk.execute('mail.threads', 'batch', { ids, workspaceId, read: true })
    argMap: {
      list: argMaps.filterOptions,
      get: wsArgMaps.id,
      update: wsArgMaps.idPayload,
      batch: wsArgMaps.payload
    }
  },
  'mail.messages': {
    service: 'mail',
    methods: {
      body: 'getBody',
      attachment: 'attachmentUrl'
    },
    // `attachment` answers the signed { url } the browser opens (§7 named the
    // op attachmentUrl; the shipped read UI calls `attachment`). Two ids ride
    // as positionals: the message id and the provider attachment id.
    //   sdk.execute('mail.messages', 'body', { id, workspaceId })
    //   sdk.execute('mail.messages', 'attachment', { id, aid, workspaceId })
    argMap: {
      body: wsArgMaps.id,
      attachment: (a) => [a?.id, a?.aid ?? a?.attachmentId, ..._wsOpts(a)]
    }
  },
  'mail.admin': {
    service: 'mail',
    methods: {
      list: 'adminListAccounts',
      remove: 'adminDisconnect',
      audit: 'adminAudit'
    },
    // `audit` reads its optional `limit` off the same filter bag as `list`
    // (the server clamps it to 1..200); `remove` is the audited force
    // disconnect.
    argMap: {
      list: argMaps.filterOptions,
      remove: wsArgMaps.id,
      audit: argMaps.filterOptions
    }
  },
  'mail.tenant': {
    service: 'mail',
    methods: {
      get: 'getTenant',
      consent: 'tenantConsentUrl',
      test: 'tenantTest',
      provision: 'tenantProvision'
    },
    // All mail-admin-gated (§3.5). `consent`/`test` take the provider as a
    // positional; `provision` also carries { dryRun } as its body — a dry
    // run previews the directory ⋈ members match with no writes.
    //   sdk.execute('mail.tenant', 'get', { workspaceId })
    //   sdk.execute('mail.tenant', 'consent', { provider: 'microsoft', workspaceId })
    //   sdk.execute('mail.tenant', 'test', { provider: 'google', workspaceId })
    //   sdk.execute('mail.tenant', 'provision', { provider: 'google', dryRun: true, workspaceId })
    argMap: {
      get: mailScopeArgs,
      consent: (a) => [a?.provider ?? (typeof a === 'string' ? a : undefined), ..._wsOpts(a)],
      test: (a) => [a?.provider ?? (typeof a === 'string' ? a : undefined), ..._wsOpts(a)],
      provision: (a) => [
        a?.provider ?? (typeof a === 'string' ? a : undefined),
        { ...(a?.dryRun !== undefined ? { dryRun: a.dryRun } : {}) },
        ..._wsOpts(a)
      ]
    }
  },
  'mail.shared': {
    service: 'mail',
    methods: {
      create: 'createShared',
      update: 'updateShared'
    },
    // `create` is test-read gated server-side (404 mailbox_not_found when
    // the tenant has no such address); `update`'s `access` is the FULL
    // replacement grants list, serviceDesk merges per key.
    //   sdk.execute('mail.shared', 'create', { workspaceId, address, name, access, serviceDesk })
    //   sdk.execute('mail.shared', 'update', { id, workspaceId, access })
    argMap: {
      create: wsArgMaps.payload,
      update: wsArgMaps.idPayload
    }
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
      remove: 'threads.remove'
    },
    argMap: {
      // orgId/workspaceId thread through to AiChatService._aiChatScope,
      // which defaults from _context.activeOrgId/activeWorkspaceId when
      // absent — an explicit-but-undefined key here is behaviorally
      // identical to omitting it (back-compat with pre-scoping callers).
      list: (a) => [
        {
          includeArchived:
            a?.includeArchived ?? a?.filter?.includeArchived ?? false,
          orgId: a?.orgId ?? a?.filter?.orgId,
          workspaceId: a?.workspaceId ?? a?.filter?.workspaceId
        }
      ],
      get: (a) => [
        a?.id ?? a?.number ?? a,
        { orgId: a?.orgId, workspaceId: a?.workspaceId }
      ],
      create: (a) => [
        a?.payload ?? a?.data ?? a,
        { orgId: a?.orgId, workspaceId: a?.workspaceId }
      ],
      remove: argMaps.id
    }
  },
  'aiChat.messages': {
    service: 'aiChat',
    methods: { list: 'messages.list' },
    argMap: {
      list: (a) => [
        a?.threadId ?? a?.id ?? a?.filter?.threadId,
        {
          limit: a?.limit ?? a?.options?.limit,
          beforeId: a?.beforeId ?? a?.options?.beforeId,
          orgId: a?.orgId ?? a?.options?.orgId,
          workspaceId: a?.workspaceId ?? a?.options?.workspaceId
        }
      ]
    }
  },
  'aiChat.completion': {
    service: 'aiChat',
    methods: { rpc: 'completion' },
    argMap: { rpc: argMaps.payload }
  },
  'aiChat.meetAnalyze': {
    service: 'aiChat',
    methods: { rpc: 'meetAnalyze' },
    argMap: { rpc: argMaps.payload }
  },
  // ─── Analyzed (AnalyzedService — Mongo-backed visitor telemetry) ────────────
  // /core/analyzed/* on the main API server. Peer to sdk.docs / sdk.tickets.
  // Replaces the workspaceProject.analyzed* Supabase surface — see
  // architecture/MODEL.md §"Visitor telemetry — Mongo migration".
  analyzed: {
    service: 'analyzed',
    methods: {
      ingest: 'ingest',
      ingestPublic: 'ingestPublic',
      listSessions: 'listSessions',
      getSession: 'getSession',
      listEvents: 'listEvents',
      listUsers: 'listUsers',
      listBugs: 'listBugs',
      // Rollup + presence reads — the dashboard chain. Registered so
      // `sdk.execute('analyzed', 'now'|…)` works like every other op
      // (previously only reachable via getService('analyzed')).
      now: 'now',
      weekly: 'weekly',
      demographics: 'demographics',
      changes: 'changes',
      activeUsers: 'activeUsers'
    },
    argMap: {
      ingest: (a) => [a],
      ingestPublic: (a) => [a?.envelope ?? a, a?.signature],
      listSessions: (a) => [a?.filter ?? {}, a?.options ?? {}],
      // wsArgMaps.id: `[id]` alone, or `[id, { workspaceId }]` when the
      // caller scopes the tab (ANALYTICS-WS-SCOPE-1).
      getSession: wsArgMaps.id,
      listEvents: (a) => [a?.filter ?? {}, a?.options ?? {}],
      listUsers: (a) => [a?.filter ?? {}, a?.options ?? {}],
      listBugs: (a) => [a?.filter ?? {}, a?.options ?? {}],
      now: (a) => [a?.filter ?? a ?? {}],
      weekly: (a) => [a?.filter ?? a ?? {}],
      demographics: (a) => [a?.filter ?? a ?? {}],
      changes: (a) => [a?.filter ?? a ?? {}],
      activeUsers: (a) => [a?.filter ?? {}, a?.options ?? {}]
    }
  },
  'docs.documents': {
    service: 'docs',
    methods: {
      list: 'documents.list',
      get: 'documents.get',
      create: 'documents.create',
      update: 'documents.update'
    },
    argMap: CRUD_ARG_MAP
  },
  'docs.kbArticles': {
    service: 'docs',
    methods: {
      list: 'kbArticles.list',
      get: 'kbArticles.get',
      create: 'kbArticles.create',
      update: 'kbArticles.update',
      children: 'kbArticles.children'
    },
    argMap: {
      ...CRUD_ARG_MAP,
      children: argMaps.id
    }
  },
  'docs.notes': {
    service: 'docs',
    methods: {
      list: 'notes.list',
      get: 'notes.get',
      create: 'notes.create',
      update: 'notes.update'
    },
    argMap: CRUD_ARG_MAP
  },
  'docs.userDocs': {
    service: 'docs',
    methods: {
      list: 'userDocs.list',
      get: 'userDocs.get',
      create: 'userDocs.create',
      update: 'userDocs.update'
    },
    argMap: CRUD_ARG_MAP
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
      remove: 'chat.removeChannel'
    },
    argMap: {
      // workspaceId is optional — WorkspaceProjectService.chat.listChannels
      // defaults to the SDK's activeWorkspaceId when undefined.
      list: (a) => [a?.workspaceId],
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id
    }
  },
  'workspaceProject.chat.members': {
    service: 'workspaceProject',
    methods: {
      // listMembers(channelId?, { bulk, workspaceId }?) — undefined channelId
      // + bulk:true routes to bulk GET /chat/members; the service throws if
      // channelId is falsy and bulk isn't explicitly true.
      list: 'chat.listMembers',
      create: 'chat.addMember',
      update: 'chat.updateMember',
      remove: 'chat.removeMember',
      markRead: 'chat.markRead',
      mute: 'chat.muteChannel'
    },
    argMap: {
      // No silent channel→workspace escalation at the service layer (see
      // WorkspaceProjectService.chat.listMembers) — this route is the
      // trusted internal caller that keeps the historical "no channelId ⇒
      // bulk" behavior working for declarative fetch: consumers by passing
      // `bulk: true` explicitly whenever channelId is absent.
      list: (a) => {
        const channelId = a?.channelId ?? a?.filter?.channelId
        return [channelId, { bulk: !channelId, workspaceId: a?.workspaceId }]
      },
      create: (a) => [
        a?.channelId,
        a?.payload ?? { user_id: a?.userId, role: a?.role }
      ],
      update: (a) => [a?.channelId, a?.userId, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.channelId, a?.userId],
      markRead: (a) => [
        a?.channelId,
        a?.userId,
        a?.lastReadAt ?? new Date().toISOString()
      ],
      mute: (a) => [a?.channelId, a?.userId, a?.muted]
    }
  },
  'workspaceProject.chat.messages': {
    service: 'workspaceProject',
    methods: {
      // listMessages(channelId?, options?) — options.bulk:true (set below
      // when channelId is absent) routes to bulk GET /chat/messages; the
      // service throws if channelId is falsy and bulk isn't explicit.
      list: 'chat.listMessages',
      create: 'chat.sendMessage',
      update: 'chat.updateMessage',
      remove: 'chat.removeMessage',
      react: 'chat.toggleReaction',
      // Org-admin-only bulk purge of every message in the caller's active
      // workspace (admin gate + workspace scoping enforced by the worker
      // route POST /chat/messages/purge). Takes no args.
      purge: 'chat.purgeMessages'
    },
    argMap: {
      // Same "no silent escalation" contract as chat.members.list above —
      // this route sets `bulk: true` for its callers so
      // sdk.execute('workspaceProject.chat.messages', 'list', {...}) with
      // no channelId keeps working byte-identically for declarative
      // fetch: consumers (the chat page's 500-row bulk load).
      list: (a) => {
        const channelId =
          a?.channelId ?? a?.filter?.channelId ?? a?.params?.channelId
        return [
          channelId,
          {
            single: a?.single,
            limit: a?.limit,
            offset: a?.offset,
            order: a?.order,
            ...(a?.options || {}),
            bulk: !channelId,
            workspaceId: a?.workspaceId ?? a?.options?.workspaceId
          }
        ]
      },
      create: (a) => [
        a?.channelId ?? a?.filter?.channelId,
        a?.payload ??
          a?.data ??
          (() => {
            const { channelId, filter, options, ...rest } = a || {}
            return rest
          })()
      ],
      update: (a) => [a?.messageId ?? a?.id, a?.payload ?? a?.data ?? a],
      remove: (a) => [a?.messageId ?? a?.id],
      react: (a) => [a?.messageId ?? a?.id, a?.emoji, a?.userId],
      // No args — the active workspace is derived server-side from the token.
      purge: () => []
    }
  },
  'workspaceProject.chat.mentions': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listMentions',
      // markRead — chat.markMentionsRead(channelId, callerEmail). Bulk-clears
      // every chat_mention row for the caller in one channel.
      markRead: 'chat.markMentionsRead'
    },
    argMap: {
      // workspaceId threads into options.workspaceId — WorkspaceProjectService
      // .chat.listMentions pulls it back out and sends it as a query param
      // (not folded into the POST body) before defaulting to activeWorkspaceId.
      list: (a) => [
        a?.filter ?? a?.params,
        {
          single: a?.single,
          limit: a?.limit,
          offset: a?.offset,
          order: a?.order,
          ...(a?.options || {}),
          workspaceId: a?.workspaceId ?? a?.options?.workspaceId
        }
      ],
      markRead: (a) => [a?.channelId, a?.callerEmail ?? a?.userId ?? a?.email]
    }
  },
  // Full-text search over chat messages — wraps chat_search_messages RPC.
  // Use sdk.execute('workspaceProject.chat.search', 'rpc', { q, callerEmail }).
  'workspaceProject.chat.search': {
    service: 'workspaceProject',
    methods: { rpc: 'chat.searchMessages' },
    argMap: {
      rpc: (a) => [
        a?.q ?? a?.query,
        a?.callerEmail ?? a?.userId ?? a?.email,
        a?.workspaceId
      ]
    }
  },
  'workspaceProject.calendar': {
    service: 'workspaceProject',
    methods: {
      list: 'calendar.listEvents',
      get: 'calendar.getEvent',
      create: 'calendar.createEvent',
      update: 'calendar.updateEvent',
      remove: 'calendar.deleteEvent',
      // CORE-CALENDAR-SERIES-BULK-SOFT-DELETE-1 — future-scope series
      // soft-delete. Filters CANNOT ride the update op (argMaps.idPayload
      // drops every non-id param by design), so the bulk pass is its own op.
      deleteFuture: 'calendar.deleteFutureEvents'
      // upsert op removed 2026-07 — calendar.upsertEvent was the last
      // PostgREST-upsert path on the calendar namespace (dropped with the
      // workspace-project Supabase org retirement).
    },
    argMap: {
      list: (a) => [a?.filter ?? a?.params],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      remove: argMaps.id,
      deleteFuture: (a) => [a?.seriesId, a?.fromDate, a?.workspaceId]
    }
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
      markAllRead: 'notifications.markAllRead'
    },
    argMap: {
      list: () => [],
      get: () => [],
      create: argMaps.payload,
      update: argMaps.id,
      markAllRead: () => []
    }
  },
  'workspaceProject.presence': {
    service: 'workspaceProject',
    methods: { list: 'presence.online', update: 'presence.heartbeat' },
    argMap: { list: () => [], update: argMaps.payload }
  },
  'workspaceProject.people': {
    service: 'workspaceProject',
    methods: {
      list: 'people.list',
      get: 'people.get',
      me: 'people.me'
    },
    argMap: { list: () => [], get: argMaps.id, me: () => [] }
  },
  'workspaceProject.permissions': {
    service: 'workspaceProject',
    methods: { list: 'permissions.me', rpc: 'permissions.check' },
    argMap: {
      list: () => [],
      rpc: (a) => [a?.action, a?.resource]
    }
  },
  'workspaceProject.search': {
    service: 'workspaceProject',
    methods: { rpc: 'search' },
    argMap: { rpc: (a) => [a?.q ?? a?.query, a?.options ?? a] }
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
      listEvents: 'activity.listEvents'
    },
    argMap: {
      list: () => [],
      create: argMaps.payload,
      scoringConfig: () => [],
      updateScoringConfig: argMaps.payload,
      heatmap: (a) => [a?.filter ?? a?.params ?? a],
      listEvents: (a) => [a?.filter ?? a?.params ?? a]
    }
  },
  // Sibling route so `fetch: { from: 'workspaceProject.activity.scoringConfig' }`
  // resolves cleanly for the admin scoring page (which expects a `list` op).
  'workspaceProject.activity.scoringConfig': {
    service: 'workspaceProject',
    methods: {
      list: 'activity.scoringConfig',
      update: 'activity.updateScoringConfig'
    },
    argMap: {
      list: () => [],
      update: argMaps.payload
    }
  },

  // ─── Standups ─────────────────────────────────────────────────────────────
  // Daily standup rows keyed on (author, date).
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
      upsert: 'standups.upsert'
    },
    argMap: {
      list: (a) => [
        a?.filter ?? a?.params,
        {
          order: a?.order,
          limit: a?.limit,
          ...(a?.options || {})
        }
      ],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      upsert: argMaps.payload
    }
  },

  // ─── System health / feature flags ────────────────────────────────────────
  // Replaces direct `_probeTable(sb, 'profiles')`-style admin probes from
  // /admin/status. `status` returns aggregated health info; `featureFlags`
  // returns the active flag map.
  'workspaceProject.system': {
    service: 'workspaceProject',
    methods: { status: 'system.status', featureFlags: 'system.featureFlags' },
    argMap: { status: () => [], featureFlags: () => [] }
  },

  // ─── Audit log ────────────────────────────────────────────────────────────
  // Replaces direct sb().from('activity_events') admin reads. Backend wires
  // /workspace/audit-log to the activity_events RLS-scoped view.
  'workspaceProject.auditLog': {
    service: 'workspaceProject',
    methods: { list: 'auditLog.list' },
    argMap: { list: argMaps.filterOptions }
  },

  // workspaceProject.rolePermissions entity removed — dead SDK surface with
  // zero callers (the /admin/permissions UI retired the role_permissions
  // fetch). The role_permissions TABLE was dropped in migration 0161
  // (2026-06); the Mongo successor is Team.permissions[].

  // ─── Analyzed (observability) ──────────────────────────────────────────────
  // Replaces Grafana Faro. Browser → main API server's Mongo-backed
  // POST /core/analyzed/ingest route (server-stamps workspace_id from the
  // JWT / envelope). The old workspace-project-worker → PostgREST →
  // analyzed_* Postgres tables path (RLS gated by app_metadata.workspace_id)
  // was deleted with the Supabase plane (2026-07-27) — every entry below is
  // now a pure alias, not a live worker route.
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
    argMap: { ingest: (a) => [a] }
  },
  'workspaceProject.analyzedSessions': {
    service: 'analyzed',
    methods: {
      list: 'listSessions',
      get: 'getSession'
    },
    argMap: {
      list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}],
      get: argMaps.id
    }
  },
  'workspaceProject.analyzedEvents': {
    service: 'analyzed',
    methods: { list: 'listEvents' },
    argMap: { list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}] }
  },
  'workspaceProject.analyzedUserSummaries': {
    service: 'analyzed',
    methods: { list: 'listUsers' },
    argMap: { list: (a) => [a?.filter ?? {}, a?.options ?? a ?? {}] }
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
          since: a?.since ?? a?.filter?.since ?? a?.params?.since
        },
        {
          limit: a?.limit ?? a?.filter?.limit ?? a?.params?.limit ?? 200,
          offset: a?.offset ?? a?.filter?.offset ?? a?.params?.offset ?? 0
        }
      ]
    }
  },

  // Announcements — Mongo cutover complete (2026-07).
  // WorkspaceProjectService.announcements routes unconditionally to the
  // /core/announcements routes; the `react` op toggles a reactor on one
  // emoji and persists via /core.
  'workspaceProject.announcements': {
    service: 'workspaceProject',
    methods: {
      list: 'announcements.list',
      get: 'announcements.get',
      create: 'announcements.create',
      update: 'announcements.update',
      remove: 'announcements.remove',
      react: 'announcements.toggleReaction'
    },
    argMap: {
      ...CRUD_ARG_MAP,
      react: (a) => [a?.id ?? a?.number, a?.emoji, a?.reactor]
    }
  },
  // workspaceProject.birthdays entity removed 2026-07 — table dropped with the
  // workspace-project Supabase org retirement; the shell derives birthdays
  // from the roster.
  // workspaceProject.stories entity removed — stories table dropped in migration 0162 (feature retired 2026-06-02; no Mongo successor).
  // WS_CRUD_ARG_MAP, not CRUD_ARG_MAP — fileCanvas.{get,create,update,remove}
  // share the SAME uniform `(…, { workspaceId })` trailing-options signature
  // as the other Phase-2/3/4 workspace-scoped services (see WS_CRUD_ARG_MAP's
  // own header). Under plain CRUD_ARG_MAP, `sdk.execute('workspaceProject.
  // fileCanvas', 'update', { id, payload })` never had a channel to carry an
  // explicit workspaceId at all (`argMaps.idPayload` returns exactly
  // `[id, payload]` — no third positional), so every write fell back SOLELY
  // to `this._context?.activeWorkspaceId` — which is unset unless MWT is on
  // AND `bootShell`'s `sdk.updateContext` has already landed for this tab. A
  // stale/missing ambient context makes the server's G1 workspace-pin guard
  // 404 ("not found") for a real, visible row — reproduced directly against
  // the dev API (workspace/tickets/sonnet.md, FILES-RENAME-1: a folder rename
  // silently reverts on Enter with no toast, only a console.error). `list`
  // is untouched (`argMaps.filterOptions`, unchanged from CRUD_ARG_MAP) —
  // fileCanvas.list already reads `filter.workspaceId` itself and callers
  // that pass one keep working identically.
  'workspaceProject.fileCanvas': {
    service: 'workspaceProject',
    methods: {
      list: 'fileCanvas.list',
      get: 'fileCanvas.get',
      create: 'fileCanvas.create',
      update: 'fileCanvas.update',
      remove: 'fileCanvas.remove'
    },
    argMap: WS_CRUD_ARG_MAP
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
      subscribe: 'records.subscribe'
    },
    // WS map, not plain CRUD: records.* shares the uniform `(…, { workspaceId })`
    // signature, and CRUD_ARG_MAP gave get/remove NO channel to carry the
    // routing param at all — on a surface without an SDK-active workspace
    // (org home) every op threw `no workspace scope`. WS_CRUD_ARG_MAP threads
    // a caller's top-level workspaceId into the options positional and keeps
    // it out of the request body.
    //
    // RECORDS_ARG_MAP, not WS_CRUD_ARG_MAP: `data` is a real field of this
    // entity's body, so the generic map's `?? a?.data` shortcut unpacked flat
    // writes down to the record payload and lost `collection`. See its
    // definition for the full note.
    argMap: RECORDS_ARG_MAP
  },
  // First-party URL enrichment for the native Bookmarks composer. CRUD still
  // belongs to `workspaceProject.records` collection `bookmarks`; this entity
  // only maps the safe metadata-preview endpoint.
  'workspaceProject.bookmarks': {
    service: 'workspaceProject',
    methods: { enrich: 'bookmarks.enrich' },
    argMap: BOOKMARKS_ARG_MAP
  },
  // workspaceProject.companyInfo + workspaceProject.companySettings entities
  // removed 2026-07 — tables dropped with the workspace-project Supabase org
  // retirement; the shell reads workspace.settings.companyInfo (canonical
  // writer: the merge-safe 'workspace.settings' PATCH route above).
  // PREFS trio — Mongo cutover complete (2026-07).
  // WorkspaceProjectService.{userPreferences,homeDashboardPrefs,
  // workspaceDashboardDefaults} route unconditionally to the Mongo
  // /core/prefs routes; the dispatcher's update→upsert mapping + payload
  // argMap are unchanged.
  'workspaceProject.userPreferences': {
    service: 'workspaceProject',
    methods: { get: 'userPreferences.get', update: 'userPreferences.upsert' },
    argMap: { get: () => [], update: argMaps.payload }
  },
  'workspaceProject.homeDashboardPrefs': {
    service: 'workspaceProject',
    methods: {
      get: 'homeDashboardPrefs.get',
      update: 'homeDashboardPrefs.upsert'
    },
    // `workspaceId` forwards as an explicit scope pin (trailing options arg →
    // query/body param, honored by the server's readExplicitWorkspaceId) so a
    // home-dashboard layout snapshot can never land under a different
    // workspace's row when the active-workspace claim flips mid-flight (the
    // workspace-switch layout-clobber fix; see workspace pages/main.js
    // _savePrefsPatch).
    argMap: {
      get: (a) =>
        a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : [],
      update: (a) => [
        a?.payload ?? a?.data ?? a,
        ...(a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : [])
      ]
    }
  },
  'workspaceProject.workspaceDashboardDefaults': {
    service: 'workspaceProject',
    methods: {
      get: 'workspaceDashboardDefaults.get',
      update: 'workspaceDashboardDefaults.upsert'
    },
    argMap: { get: () => [], update: argMaps.payload }
  },
  // AI-created home widgets (tickets/opus.md "Per-workspace AI-CREATED
  // widgets"). Same explicit-workspace pin as homeDashboardPrefs above — the
  // home board is workspace-scoped and its reads must not follow a claim that
  // flipped mid-flight.
  //
  // The stored `body` is a fixed-vocabulary DATA tree and `dataRecipe` is one
  // declarative fetch descriptor; the server validates both on write and
  // re-checks the CALLING user's capability on every read (each row carries
  // `viewerCapability`). This entity is transport — it interprets neither.
  'workspaceProject.widgetDefs': {
    service: 'workspaceProject',
    methods: {
      list: 'widgetDefs.list',
      create: 'widgetDefs.create',
      update: 'widgetDefs.update',
      remove: 'widgetDefs.remove'
    },
    argMap: {
      list: (a) => (a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : []),
      create: (a) => [
        a?.widget ?? a?.payload ?? a?.data ?? a,
        ...(a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : [])
      ],
      update: (a) => [
        a?.id,
        a?.widget ?? a?.payload ?? a?.data ?? {},
        ...(a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : [])
      ],
      remove: (a) => [
        a?.id,
        ...(a?.workspaceId != null ? [{ workspaceId: a.workspaceId }] : [])
      ]
    }
  },
  // workspaceProject.workspaceSettings entity removed 2026-07 — table dropped
  // with the workspace-project Supabase org retirement. The canonical
  // settings writer is the merge-safe 'workspace.settings' PATCH route above
  // (WorkspaceService.updateWorkspaceSettings).
  // workspaceProject.userGrants + workspaceProject.valuations entities
  // removed 2026-07 — tables dropped with the org retirement; no live
  // consumers.
  'workspaceProject.userProfiles': {
    service: 'workspaceProject',
    methods: {
      list: 'userProfiles.list',
      get: 'userProfiles.get',
      update: 'userProfiles.update'
    },
    argMap: { list: () => [], get: argMaps.id, update: argMaps.idPayload }
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
      reopen: 'meet.reopenRoom'
    },
    argMap: {
      list: () => [],
      get: argMaps.id,
      create: argMaps.payload,
      update: argMaps.idPayload,
      end: argMaps.id,
      reopen: argMaps.id
    }
  },
  'workspaceProject.meet.transcripts': {
    service: 'workspaceProject',
    methods: { list: 'meet.listTranscripts' },
    argMap: { list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a] }
  },
  // Members of a single meet room. Read = list members; create =
  // sb.from('meet_room_members').insert() — the createRoom flow auto-adds
  // the creator as 'owner'. RLS gates inserts to user_id = auth.uid().
  'workspaceProject.meet.members': {
    service: 'workspaceProject',
    methods: {
      list: 'meet.listMembers',
      create: 'meet.addMember'
    },
    argMap: {
      list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a],
      create: (a) => [
        a?.roomId ?? a?.filter?.room_id,
        a?.payload ??
          a?.data ??
          (() => {
            const { roomId, filter, options, ...rest } = a || {}
            return rest
          })()
      ]
    }
  },
  // Raw transcribed utterance rows — distinct from the higher-level
  // `meet.transcripts` analysis summaries.
  'workspaceProject.meet.utterances': {
    service: 'workspaceProject',
    methods: { list: 'meet.listUtterances' },
    argMap: { list: (a) => [a?.roomId ?? a?.filter?.room_id ?? a] }
  },
  // Combined utterances + cached analysis view. Wraps the
  // get_meet_transcript_view(uuid) RPC so MeetTranscriptPage's `fetch:`
  // decl can replace the bare RPC handle with an entity route.
  'workspaceProject.meet.transcriptView': {
    service: 'workspaceProject',
    methods: { rpc: 'meet.getTranscriptView' },
    argMap: {
      rpc: (a) => [
        a?.roomId ??
          a?.p_room_id ??
          a?.params?.p_room_id ??
          a?.filter?.room_id ??
          a
      ]
    }
  },
  // Patch applied_items on a meet_transcript_analyses row when the
  // user "applies" a suggestion (saves as note, creates ticket, etc).
  'workspaceProject.meet.analysisAppliedItems': {
    service: 'workspaceProject',
    methods: { update: 'meet.updateAnalysisAppliedItems' },
    argMap: {
      update: (a) => [
        a?.roomId ?? a?.id ?? a?.filter?.room_id,
        a?.applied_items ?? a?.appliedItems ?? a?.payload ?? a?.data
      ]
    }
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
      reject: 'meet.rejectGuest'
    },
    argMap: {
      list: () => [],
      admit: argMaps.id,
      reject: argMaps.id
    }
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
    argMap: { rpc: argMaps.payload }
  },
  // #2226 — owner remote-mute. mute({ roomId, participantIdentity, trackSid,
  // muted }) → worker /meet/mute → meet-mute edge fn → LiveKit.
  'workspaceProject.meet.mute': {
    service: 'workspaceProject',
    methods: { mute: 'meet.mute' },
    argMap: { mute: argMaps.payload }
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
    argMap: {
      subscribe: (a) => [{ channelId: a?.channelId ?? a?.filter?.channelId }]
    }
  },
  'workspaceProject.realtime.channels': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeChannels' },
    argMap: { subscribe: (a) => [a?.filter ?? a ?? {}] }
  },
  'workspaceProject.realtime.mentions': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeMentions' },
    argMap: {
      subscribe: (a) => [{ userEmail: a?.userEmail ?? a?.filter?.userEmail }]
    }
  },
  'workspaceProject.realtime.notifications': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribeNotifications' },
    argMap: {
      subscribe: (a) => [{ userEmail: a?.userEmail ?? a?.filter?.userEmail }]
    }
  },
  'workspaceProject.realtime.presence': {
    service: 'workspaceProject',
    methods: { subscribe: 'realtime.subscribePresence' },
    argMap: { subscribe: (a) => [{ scope: a?.scope ?? 'workspace' }] }
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
      subscribe: (a) => [
        {
          roomId: a?.roomId ?? a?.filter?.roomId,
          workspaceId: a?.workspaceId ?? a?.filter?.workspaceId,
          tables: a?.tables ?? a?.filter?.tables
        }
      ]
    }
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
      download: 'storage.download'
    },
    argMap: {
      signedUrl: (a) => [a?.bucket, a?.path, a?.ttl ?? 300],
      upload: (a) => [a?.bucket, a?.formData ?? a?.payload, a?.options ?? {}],
      remove: (a) => [a?.bucket, a?.path],
      publicUrl: (a) => [a?.bucket, a?.path],
      download: (a) => [a?.bucket, a?.path]
    }
  },

  // workspaceProject.agentMessages + the bare 'agent_messages' back-compat
  // alias removed — agent_messages table dropped in migration 0159; the
  // SDK surface (WorkspaceProjectService.agentMessages) had zero live callers
  // and the referenced shared/functions/agentMessages.js never existed.

  // workspaceProject.feed (+ .likes / .comments) and workspaceProject.follows
  // entities removed 2026-07 — the community feed + follow graph tables
  // (0106_community_feed.sql) were dropped with the workspace-project
  // Supabase org retirement; no live consumers and no Mongo successor.

  // Generic escape-hatch for one-off RPCs that don't have a dedicated route.
  // sdk.execute('workspaceProject.query', 'rpc', { body }) calls
  // workspaceProject.query(body). Use sparingly — prefer adding a real route.
  'workspaceProject.query': {
    service: 'workspaceProject',
    methods: { rpc: 'query' },
    argMap: { rpc: argMaps.payload }
  },

  // ─── Canvas layout (workspace-level, Mongo-backed) ────────────────────────
  // Replaces per-project setProjectValue(_, ['canvasPosition'], …) +
  // getProjectData catch-up fetches with O(1) workspace-scoped reads/writes.
  // Server contract: GET/PATCH /workspaces/:wsId/canvas-layout.
  // Socket: 'canvas-layout-changed' on the user-socket workspace channel.
  canvasLayout: {
    service: 'canvasLayout',
    methods: {
      get: 'getCanvasLayout',
      patch: 'patchCanvasLayout',
      subscribe: 'subscribeWorkspaceCanvasLayout'
    },
    argMap: {
      get: (a) => [a?.workspaceId ?? a?.id ?? a],
      patch: (a) => [
        a?.workspaceId ?? a?.id,
        a?.payload ??
          (() => {
            const { workspaceId, id, ...rest } = a || {}
            return rest
          })()
      ],
      subscribe: (a) => [a?.workspaceId ?? a?.id ?? a]
    }
  },

  // ─── Project (canvas build unit) ──────────────────────────────────────────
  project: {
    service: 'project',
    methods: {
      list: 'listProjects',
      get: 'getProject',
      create: 'createProject',
      update: 'updateProject',
      remove: 'removeProject'
    }
  },

  // ─── Project version history ──────────────────────────────────────────────
  'project.versions': {
    service: 'project',
    methods: {
      list: 'getProjectVersions',
      get: 'getProjectVersion',
      rpc: 'restoreProjectVersion'
    },
    argMap: {
      list: (a) => [
        a?.projectId ?? a?.params?.projectId ?? a?.filter?.projectId,
        {
          branch: a?.branch ?? a?.params?.branch,
          page: a?.page ?? a?.params?.page,
          limit: a?.limit ?? a?.params?.limit,
          fields: a?.fields ?? a?.params?.fields
        }
      ],
      get: (a) => [
        a?.projectId ?? a?.params?.projectId,
        a?.versionId ?? a?.id ?? a?.params?.versionId
      ],
      rpc: (a) => [
        a?.projectId ?? a?.params?.projectId,
        a?.version ?? a?.versionId ?? a?.params?.version,
        {
          message: a?.message ?? a?.params?.message,
          branch: a?.branch ?? a?.params?.branch,
          type: a?.type ?? a?.params?.type
        }
      ]
    }
  },

  // ─── Branch / PullRequest ─────────────────────────────────────────────────
  'project.branch': {
    service: 'branch',
    methods: {
      list: 'listBranches',
      get: 'getBranch',
      create: 'createBranch',
      remove: 'deleteBranch'
    }
  },
  'project.pullRequest': {
    service: 'pullRequest',
    methods: {
      list: 'list',
      get: 'get',
      create: 'create',
      update: 'update',
      remove: 'remove'
    }
  },

  // ─── Collab (canvas project realtime via socket.io) ──────────────────────
  'project.collab': {
    service: 'collab',
    methods: { subscribe: 'subscribe' }
  },

  // ─── Marketplace ──────────────────────────────────────────────────────────
  'marketplace.listings': {
    service: 'marketplace',
    methods: { list: 'list', get: 'get' }
  },

  // ─── File / Screenshot / Misc ─────────────────────────────────────────────
  file: {
    service: 'file',
    methods: { list: 'list', get: 'get', create: 'upload', remove: 'remove' }
  },
  screenshot: {
    service: 'screenshot',
    methods: { get: 'getScreenshotByKey' }
  },

  // ─── Builds & Deploy (BuildsService — /core/builds/*, workspace-scoped) ──
  // The Railway-style pipeline behind the /infra canvas: GitHub App install →
  // repo import (WorkspaceRepo) → Cloud Build → Cloud Run. Every op threads
  // `workspaceId` positionally (routes are /builds/workspaces/:workspaceId/*).
  // Declarative `fetch:` calls arrive packed as { filter, params, ... }
  // (sdkAdapter._packSelect) — read workspaceId from either bag.
  'builds.github': {
    service: 'builds',
    methods: { state: 'getBuildsGitHubState', get: 'getBuildsGitHubState' },
    argMap: {
      state: (a) => [buildsWs(a)],
      get: (a) => [buildsWs(a)]
    }
  },
  'builds.repos': {
    service: 'builds',
    methods: { list: 'listBuildRepos' },
    argMap: { list: (a) => [buildsWs(a)] }
  },
  'builds.imports': {
    service: 'builds',
    methods: {
      list: 'listBuildImports',
      create: 'createBuildImport',
      update: 'updateBuildImport',
      remove: 'deleteBuildImport'
    },
    argMap: {
      list: (a) => [buildsWs(a)],
      create: (a) => [buildsWs(a), a?.payload ?? a?.data],
      update: (a) => [buildsWs(a), buildsRepo(a), a?.payload ?? a?.data ?? {}],
      remove: (a) => [buildsWs(a), buildsRepo(a)]
    }
  },
  'builds.builds': {
    service: 'builds',
    methods: {
      list: 'listBuilds',
      get: 'getBuild',
      create: 'triggerBuild',
      logs: 'getBuildLogs',
      // Workspace-level build/deploy status stream — the handlers bag
      // ({ onBuildStatus?, onDeploymentStatus?, workspaceId? }) passes
      // through as the single argument.
      subscribe: 'subscribeWorkspaceBuilds'
    },
    argMap: {
      list: (a) => [buildsWs(a), { limit: a?.limit }],
      get: (a) => [buildsWs(a), a?.id ?? a?.buildId ?? a?.params?.id],
      create: (a) => [
        buildsWs(a),
        a?.repoId ?? a?.params?.repoId,
        a?.payload ?? {}
      ],
      logs: (a) => [
        buildsWs(a),
        buildsBuild(a),
        { tailBytes: a?.tailBytes ?? a?.params?.tailBytes }
      ],
      subscribe: (a) => [a]
    }
  },
  'builds.deployments': {
    service: 'builds',
    methods: {
      list: 'listBuildDeployments',
      create: 'deployBuild',
      rollback: 'rollbackDeployment',
      scale: 'scaleDeployment',
      // verb 7 — Cloud Run metrics buckets (MetricsCollectorService, GATED
      // OFF by default). Accepts either the imperative options bag or the
      // fetch-adapter { params } pack for interval/since/until/limit.
      metrics: 'getDeploymentMetrics',
      // Same workspace-level stream as builds.builds — one subscription
      // covers both build and deployment status events.
      subscribe: 'subscribeWorkspaceBuilds'
    },
    argMap: {
      list: (a) => [buildsWs(a)],
      create: (a) => [
        buildsWs(a),
        a?.buildId ?? a?.params?.buildId,
        a?.payload ?? {}
      ],
      rollback: (a) => [buildsWs(a), buildsDeployment(a)],
      scale: (a) => [
        buildsWs(a),
        buildsDeployment(a),
        a?.payload ?? a?.data ?? {}
      ],
      metrics: (a) => [
        buildsWs(a),
        buildsDeployment(a),
        {
          interval: a?.interval ?? a?.params?.interval,
          since: a?.since ?? a?.params?.since,
          until: a?.until ?? a?.params?.until,
          limit: a?.limit ?? a?.params?.limit
        }
      ],
      subscribe: (a) => [a]
    }
  },

  // ─── Project custom domains (DnsService — PR #440 lifecycle) ─────────────
  // API-owned custom-domain onboarding on /core/projects/:projectId/domains.
  // `add` PATCHes { customDomains, envKey? } and returns { domains: { map,
  // statuses }, onboarding[], guidance[], operations, warnings }; `status`
  // walks needs_dns → pending_hostname_validation → pending_ssl → active.
  projectDomains: {
    service: 'dns',
    methods: {
      list: 'getProjectDomains',
      add: 'addProjectCustomDomains',
      create: 'addProjectCustomDomains',
      setup: 'startProjectCustomDomainSetup',
      poll: 'pollProjectCustomDomainStatus',
      remove: 'removeProjectCustomDomain',
      check: 'checkProjectDomain',
      status: 'getProjectCustomDomainStatus',
      instructions: 'getProjectDomainInstructions'
    },
    argMap: {
      list: (a) => [domainsProject(a)],
      add: (a) => [
        domainsProject(a),
        a?.customDomains ?? a?.domains ?? a?.hostname,
        a?.options ?? (a?.envKey ? { envKey: a.envKey } : {})
      ],
      create: (a) => [
        domainsProject(a),
        a?.customDomains ?? a?.domains ?? a?.hostname,
        a?.options ?? (a?.envKey ? { envKey: a.envKey } : {})
      ],
      setup: (a) => [
        domainsProject(a),
        domainsHost(a),
        a?.options ?? (a?.envKey ? { envKey: a.envKey } : {})
      ],
      poll: (a) => [domainsProject(a), domainsHost(a), a?.options ?? {}],
      remove: (a) => [domainsProject(a), domainsHost(a)],
      check: (a) => [domainsProject(a), domainsHost(a)],
      status: (a) => [domainsProject(a), domainsHost(a)],
      instructions: (a) => [domainsProject(a), domainsHost(a)]
    }
  },

  // ─── Org integrations — CRUD (connect / grant / scope lifecycle) ─────────
  // Org-scoped integration rows (OrgIntegration model) behind /org-integrations/*.
  // Ops map to IntegrationService's org-integration CRUD methods. The server
  // gates mutations (upsert/remove/assignScope/reorder) to owner/admin, `list`
  // to any org member, and `kinds` to any authenticated user. This is the
  // management surface; `call` is the per-kind data-plane dispatch verb
  // (gated per-kind server-side — owner/admin by default; instantdb admits
  // any org member) — see IntegrationService.callOrgIntegrationCapability.
  //   sdk.execute('orgIntegration', 'list', { orgId, scopeType, scopeId })
  //   sdk.execute('orgIntegration', 'upsert', { orgId, kind, slug, config, secret })
  //   sdk.execute('orgIntegration', 'kinds')
  //   sdk.execute('orgIntegration', 'call', { orgId, idOrSlug, capability, args, workspaceId })
  orgIntegration: {
    service: 'integration',
    methods: {
      list: 'listOrgIntegrations',
      upsert: 'upsertOrgIntegration',
      remove: 'deleteOrgIntegration',
      assignScope: 'assignOrgIntegrationScope',
      reorder: 'reorderOrgIntegrations',
      kinds: 'listOrgIntegrationKinds',
      call: 'callOrgIntegrationCapability'
    },
    argMap: {
      list: (a) => [orgIntegrationListArgs(a)],
      upsert: argMaps.payload,
      remove: argMaps.payload,
      assignScope: argMaps.payload,
      reorder: argMaps.payload,
      kinds: () => [],
      call: argMaps.payload
    }
  },

  // ─── Marketplace integrations — install/uninstall/entitlement lifecycle ──
  // /marketplace/integrations/* (CU-INT §180). A distinct resource from
  // 'marketplace.listings' above (the project-template marketplace) and
  // from 'orgIntegration' above (the connect/grant/scope CRUD) — this is
  // the paid-install + entitlement surface that gates 'orgIntegration'
  // call's workspace_required / no_active_entitlement errors for paid kinds.
  //   sdk.execute('marketplace.integrations', 'list', { workspaceId })
  //   sdk.execute('marketplace.integrations', 'get', { workspaceId, kind })
  //   sdk.execute('marketplace.integrations', 'create', { orgId, workspaceId, kind })
  //   sdk.execute('marketplace.integrations', 'remove', { orgId, workspaceId, kind })
  'marketplace.integrations': {
    service: 'integration',
    methods: {
      list: 'listMarketplaceEntitlements',
      get: 'checkMarketplaceEntitlement',
      create: 'installMarketplaceIntegration',
      remove: 'uninstallMarketplaceIntegration'
    },
    argMap: {
      list: (a) => {
        const bag = marketplaceIntegrationArgs(a)
        return [bag.workspaceId, { status: bag.status }]
      },
      get: (a) => [marketplaceIntegrationArgs(a)],
      create: argMaps.payload,
      remove: argMaps.payload
    }
  }
}

// Arg resolvers for the builds/projectDomains routes — accept both the
// imperative shape ({ workspaceId }) and the declarative fetch-adapter shape
// ({ filter, params }), falling back to a bare string arg.
const buildsWs = (a) =>
  a?.workspaceId ??
  a?.params?.workspaceId ??
  a?.filter?.workspaceId ??
  (typeof a === 'string' ? a : undefined)

// Row-id resolvers for the builds control-plane verbs — same dual-shape
// tolerance as buildsWs (imperative bag OR fetch-adapter { params } pack),
// with `id` as the generic fallback key.
const buildsRepo = (a) =>
  a?.repoId ?? a?.params?.repoId ?? a?.id ?? a?.params?.id

const buildsBuild = (a) =>
  a?.buildId ?? a?.params?.buildId ?? a?.id ?? a?.params?.id

const buildsDeployment = (a) =>
  a?.deploymentId ?? a?.params?.deploymentId ?? a?.id ?? a?.params?.id

const domainsProject = (a) =>
  a?.projectId ??
  a?.params?.projectId ??
  a?.filter?.projectId ??
  (typeof a === 'string' ? a : undefined)

const domainsHost = (a) =>
  a?.domain ?? a?.hostname ?? a?.params?.domain ?? a?.params?.hostname

// Query-param bag builder for the orgIntegration.list op — accepts both the
// imperative shape ({ orgId, scopeType, ... }) and the declarative
// fetch-adapter pack ({ filter, params }). listOrgIntegrations drops
// undefined fields from the query string.
const orgIntegrationListArgs = (a) => ({
  orgId: a?.orgId ?? a?.params?.orgId ?? a?.filter?.orgId,
  scopeType: a?.scopeType ?? a?.params?.scopeType ?? a?.filter?.scopeType,
  scopeId: a?.scopeId ?? a?.params?.scopeId ?? a?.filter?.scopeId,
  includeParents:
    a?.includeParents ?? a?.params?.includeParents ?? a?.filter?.includeParents
})

// Query-param bag builder for the marketplace.integrations list/get ops —
// same dual-shape tolerance as orgIntegrationListArgs (imperative bag OR
// fetch-adapter { filter, params } pack). `kind` only matters for `get`
// (entitlement-check); `status` only matters for `list` (entitlements);
// each argMap picks the field it needs and drops the rest.
const marketplaceIntegrationArgs = (a) => ({
  workspaceId:
    a?.workspaceId ?? a?.params?.workspaceId ?? a?.filter?.workspaceId,
  kind: a?.kind ?? a?.params?.kind ?? a?.filter?.kind,
  status: a?.status ?? a?.params?.status ?? a?.filter?.status
})

const resolveDottedMethod = (target, methodPath) => {
  if (!target || !methodPath) return null
  return methodPath.split('.').reduce((obj, key) => obj?.[key], target)
}

// Public: register additional entity routes at runtime.
// Useful for plugins/services that want to expose new entities via sdk.execute
// without modifying this file.
export const registerEntity = (path, route) => {
  if (typeof path !== 'string')
    throw new Error('[registerEntity] path must be a string')
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
      throw new Error(
        `[sdk.execute] Unknown entity: '${from}'. Known: ${Object.keys(
          ENTITY_ROUTES
        ).join(', ')}`
      )
    }
    const methodPath = route.methods[op]
    if (!methodPath) {
      throw new Error(
        `[sdk.execute] Entity '${from}' does not support op '${op}'. Supported ops: ${Object.keys(
          route.methods
        ).join(', ')}`
      )
    }

    let service
    try {
      service = sdk.getService(route.service)
    } catch (err) {
      throw new Error(
        `[sdk.execute] Service '${route.service}' for entity '${from}' is not available: ${err.message}`
      )
    }

    const fn = resolveDottedMethod(service, methodPath)
    if (typeof fn !== 'function') {
      throw new Error(
        `[sdk.execute] Method '${methodPath}' not found on service '${route.service}' (entity '${from}', op '${op}')`
      )
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
