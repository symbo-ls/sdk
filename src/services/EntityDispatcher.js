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
// Routes are intentionally explicit: the dispatcher does NOT auto-resolve method
// names by convention. Every entity+op combination must be registered here.

const ENTITY_ROUTES = {
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
  'workspaceProject.tickets': {
    service: 'workspaceProject',
    methods: {
      list: 'tickets.list',
      get: 'tickets.get',
      create: 'tickets.create',
      update: 'tickets.update',
      remove: 'tickets.remove',
    },
  },
  'workspaceProject.chat': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listChannels',
      create: 'chat.createChannel',
    },
  },
  'workspaceProject.chat.messages': {
    service: 'workspaceProject',
    methods: {
      list: 'chat.listMessages',
      create: 'chat.sendMessage',
    },
  },
  'workspaceProject.chat.members': {
    service: 'workspaceProject',
    methods: { list: 'chat.listMembers' },
  },
  'workspaceProject.calendar': {
    service: 'workspaceProject',
    methods: {
      list: 'calendar.listEvents',
      create: 'calendar.createEvent',
      update: 'calendar.updateEvent',
      remove: 'calendar.deleteEvent',
    },
  },
  'workspaceProject.documents': {
    service: 'workspaceProject',
    methods: {
      list: 'documents.list',
      get: 'documents.get',
      create: 'documents.create',
      update: 'documents.update',
    },
  },
  'workspaceProject.notifications': {
    service: 'workspaceProject',
    methods: {
      list: 'notifications.list',
      get: 'notifications.unreadCount',
      update: 'notifications.markRead',
    },
  },
  'workspaceProject.presence': {
    service: 'workspaceProject',
    methods: { list: 'presence.online', update: 'presence.heartbeat' },
  },
  'workspaceProject.people': {
    service: 'workspaceProject',
    methods: { list: 'people.list', get: 'people.get' },
  },
  'workspaceProject.permissions': {
    service: 'workspaceProject',
    methods: { list: 'permissions.me', rpc: 'permissions.check' },
  },
  'workspaceProject.search': {
    service: 'workspaceProject',
    methods: { rpc: 'search' },
  },
  'workspaceProject.activity': {
    service: 'workspaceProject',
    methods: { list: 'activity.listNotes', create: 'activity.addNote' },
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

    // For subscriptions, the second arg is the callback; pass it through.
    if (op === 'subscribe' && typeof cb === 'function') {
      return fn.call(service, args, cb)
    }
    return fn.call(service, args)
  }

  // Expose introspection helpers on the dispatcher for debugging/tooling.
  execute.listEntities = listEntities
  execute.getRoute = (from) => ENTITY_ROUTES[from] || null

  return execute
}

export default createEntityDispatcher
