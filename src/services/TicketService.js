import { BaseService } from './BaseService.js'

// TicketService wraps the MAIN SERVER /tickets/* routes (Mongo-backed).
// These are first-class main-server routes, NOT workspace-project worker
// routes — do NOT use _ws() here. All calls go through _call() which
// routes to ${apiUrl}/core/tickets/*.
//
// Architecture note (Phase 3 migration):
//   Old path: sdk.workspaceProject.tickets.* → _ws() → /workspace-project/tickets/*
//   New path: sdk.tickets.* → _call() → /tickets/* (main server, Mongo)
//
// Back-compat aliases on WorkspaceProjectService delegate to this service
// for one cutover cycle before being removed in Phase 4.
export class TicketService extends BaseService {
  // ==================== TICKET READS ====================

  /**
   * Active-workspace scope. The server's /tickets list, epic-counts and
   * resolutions routes are workspace-scoped (workspaceId REQUIRED — 400
   * without it). Auto-attach the active workspace when the caller didn't
   * pass one, resolved the same way AiService does: live SDK context first,
   * then the persisted `activeWorkspace` storage key.
   *
   * @returns {string|null} Active workspace id, or null when unknown
   */
  _workspaceScope () {
    if (this._context?.activeWorkspaceId) return this._context.activeWorkspaceId
    try { return globalThis.localStorage?.getItem('activeWorkspace') || null } catch (_) { return null }
  }

  /**
   * List tickets matching filter and options.
   *
   * @param {object} filter - Filter criteria (ownerOrganization, project, state, assignee, etc.)
   * @param {object} options - Pagination/sort options (limit, offset, order, etc.)
   * @returns {Promise<Array>} Array of ticket documents
   */
  list (filter = {}, options = {}) {
    const scoped = (filter.workspaceId || filter.workspace || filter.workspace_id)
      ? filter
      : { ...filter, workspaceId: this._workspaceScope() || undefined }
    return this._call('tickets.list', '/tickets/list', {
      method: 'POST',
      body: { filter: scoped, options }
    })
  }

  /**
   * Per-column ticket counts in ONE server aggregation. Same filter
   * semantics as list() (workspace auto-scope included) — replaces the
   * per-column list({limit:0, includeCount}) fan-out.
   *
   * @param {object} filter - Filter criteria (cycleId, assigneeEmail, etc.)
   * @returns {Promise<object>} Map of columnKey → count
   */
  columnCounts (filter = {}) {
    const scoped = (filter.workspaceId || filter.workspace || filter.workspace_id)
      ? filter
      : { ...filter, workspaceId: this._workspaceScope() || undefined }
    return this._call('tickets.columnCounts', '/tickets/column-counts', {
      method: 'POST',
      body: { filter: scoped }
    })
  }

  /**
   * Get a single ticket by ID.
   *
   * @param {string} ticketId - MongoDB ObjectId or external_id string
   * @returns {Promise<object>} Ticket document
   */
  get (ticketId) {
    return this._call('tickets.get', `/tickets/${encodeURIComponent(ticketId)}`)
  }

  /**
   * Get epic ticket counts grouped by epic label.
   *
   * @returns {Promise<object>} Map of epic label → count
   */
  epicCounts () {
    const wid = this._workspaceScope()
    const qs = wid ? `?workspaceId=${encodeURIComponent(wid)}` : ''
    return this._call('tickets.epicCounts', `/tickets/epic-counts${qs}`)
  }

  /**
   * Fetch the agent queue for a given assignee email.
   * Used by epic agents to poll their work queue.
   *
   * @param {object} params
   * @param {string} [params.assigneeEmail] - Filter by assignee email
   * @param {number} [params.limit=50] - Max results
   * @returns {Promise<Array>} Array of queued ticket documents
   */
  agentQueue ({ assigneeEmail, limit = 50 } = {}) {
    const params = new URLSearchParams()
    if (assigneeEmail) params.set('assignee_email', assigneeEmail)
    if (limit) params.set('limit', String(limit))
    return this._call('tickets.agentQueue', `/tickets/agent-queue?${params}`)
  }

  // ==================== TICKET WRITES ====================

  /**
   * Create a ticket. Accepts either a JSON payload object or a markdown string.
   *
   * JSON shape:
   *   create({ title: 'Fix bug', body: '...', labels: ['backend'] })
   *
   * Markdown shape (Content-Type: text/markdown):
   *   create('# Fix bug\n\nbody text here')
   *
   * @param {object|string} payload - Ticket data or raw markdown string
   * @returns {Promise<object>} Created ticket document
   */
  create (payload) {
    if (typeof payload === 'string') {
      return this._call('tickets.create', '/tickets', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'text/markdown' }
      })
    }
    return this._call('tickets.create', '/tickets', {
      method: 'POST',
      body: { payload }
    })
  }

  /**
   * Update a ticket. Accepts JSON or markdown. Supports optimistic concurrency
   * via the If-Match header (pass the ticket's current _etag or version).
   *
   * @param {string} ticketId - Ticket ID to update
   * @param {object|string} payload - Updated fields or raw markdown
   * @param {object} [opts]
   * @param {string} [opts.ifMatch] - ETag for optimistic concurrency check
   * @returns {Promise<object>} Updated ticket document
   */
  update (ticketId, payload, { ifMatch } = {}) {
    const headers = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    // Writes are workspace-scoped server-side too — attach the active
    // workspace as a query param (read by workspaceIdFromRequest) so BOTH
    // payload shapes (JSON + markdown body) carry the scope.
    const wid = this._workspaceScope()
    const qs = wid ? `?workspaceId=${encodeURIComponent(wid)}` : ''
    if (typeof payload === 'string') {
      headers['Content-Type'] = 'text/markdown'
      return this._call('tickets.update', `/tickets/${encodeURIComponent(ticketId)}${qs}`, {
        method: 'PUT',
        body: payload,
        headers
      })
    }
    return this._call('tickets.update', `/tickets/${encodeURIComponent(ticketId)}${qs}`, {
      method: 'PUT',
      body: { payload },
      headers
    })
  }

  /**
   * Delete a ticket permanently.
   *
   * @param {string} ticketId - Ticket ID to delete
   * @returns {Promise<null>}
   */
  remove (ticketId) {
    const wid = this._workspaceScope()
    const qs = wid ? `?workspaceId=${encodeURIComponent(wid)}` : ''
    return this._call('tickets.remove', `/tickets/${encodeURIComponent(ticketId)}${qs}`, {
      method: 'DELETE'
    })
  }

  /**
   * Assign a ticket to an agent or user by email.
   *
   * @param {string} ticketId - Ticket ID
   * @param {string} assigneeEmail - Assignee email address
   * @returns {Promise<object>} Updated ticket document
   */
  assign (ticketId, assigneeEmail) {
    return this._call('tickets.assign', `/tickets/${encodeURIComponent(ticketId)}/assign`, {
      method: 'POST',
      body: { assigneeEmail }
    })
  }

  // ==================== COMMENTS SUB-NAMESPACE ====================
  // Bound as arrow functions so `sdk.tickets.comments.list(id)` works
  // safely after destructure (no `this` binding issues).

  comments = {
    /**
     * List comments for a ticket ordered by creation time.
     *
     * @param {string} ticketId - Ticket ID
     * @returns {Promise<Array>} Array of comment documents
     */
    list: (ticketId) =>
      this._call('tickets.comments.list', `/tickets/${encodeURIComponent(ticketId)}/comments`),

    /**
     * Add a comment to a ticket.
     *
     * @param {string} ticketId - Ticket ID
     * @param {string} body - Comment markdown body
     * @returns {Promise<object>} Created comment document
     */
    create: (ticketId, body) =>
      this._call('tickets.comments.create', `/tickets/${encodeURIComponent(ticketId)}/comments`, {
        method: 'POST',
        body: { body }
      }),

    /**
     * Update an existing comment body.
     *
     * @param {string} id - Comment ID
     * @param {string} body - New comment markdown body
     * @returns {Promise<object>} Updated comment document
     */
    update: (id, body) =>
      this._call('tickets.comments.update', `/tickets/comments/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { body }
      }),

    /**
     * Delete a comment.
     *
     * @param {string} id - Comment ID
     * @returns {Promise<null>}
     */
    remove: (id) =>
      this._call('tickets.comments.remove', `/tickets/comments/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
  }

  // ==================== RELEASE SUB-NAMESPACE ====================
  //
  // Cross-repo (workspace + server + sdk) GitHub Release coordination from
  // the /tickets/release UI. The server route mints a github-sync App
  // installation token, hits the GitHub Releases API for each repo, and
  // stamps every shipped ticket with releaseId + releasedAt.

  release = {
    /**
     * Stage 1 — tickets queued for the next main→release promotion.
     * state=ready_to_test (merged to main, awaiting QA on the
     * main→release preview). Newest first.
     */
    listForStaging: ({ limit } = {}) => {
      const qs = limit ? `?limit=${encodeURIComponent(limit)}` : ''
      return this._call('tickets.release.staging', `/tickets/release/staging${qs}`)
    },

    /**
     * Stage 2 — tickets queued for `gh release create` (state=done,
     * already on the release branch / live on staging, no releaseId yet).
     */
    listForProd: ({ limit } = {}) => {
      const qs = limit ? `?limit=${encodeURIComponent(limit)}` : ''
      return this._call('tickets.release.prod', `/tickets/release/prod${qs}`)
    },

    /**
     * List past releases ordered by createdAt desc.
     */
    list: ({ limit, skip } = {}) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (skip) params.set('skip', String(skip))
      const qs = params.toString()
      return this._call('tickets.release.list', `/tickets/release${qs ? `?${qs}` : ''}`)
    },

    /**
     * Cut a prod release across workspace + server + sdk. The server
     * reads each repo's package.json version on main, creates a GitHub
     * Release at `v${version}`, and stamps every Stage-2 ticket with
     * releaseId + releasedAt + state→`released`.
     */
    create: (payload = {}) =>
      this._call('tickets.release.create', '/tickets/release', {
        method: 'POST',
        body: payload || {}
      }),

    /**
     * Stage-1 promote — open `main → release` PRs across each repo
     * via the github-sync App installation token. Idempotent at the
     * head/base pair; re-running returns the existing open PR per
     * repo. Manager-gated server-side (owner / co-owner / admin /
     * maintainer); non-managers get 403 manager_role_required.
     *
     * Payload: { repos?: string[], owner?: string }
     * Returns: { repos: [{repo, owner, status, prUrl, prNumber, error?}] }
     */
    promoteToStaging: (payload = {}) =>
      this._call('tickets.release.promoteToStaging', '/tickets/release/promote-staging', {
        method: 'POST',
        body: payload || {}
      })
  }

  // ==================== CYCLE SUB-NAMESPACE ====================
  //
  // Roadmap planning groups surfaced on /tickets/roadmap. Manager-defined
  // windows that own a set of tickets via Ticket.cycleId. Mutating calls
  // require the caller to hold an ORG_MGMT_ROLES baseTier on the active
  // org (enforced server-side).

  cycle = {
    /**
     * List cycles for the active org, newest active first, then
     * planned/released/archived. Each row carries completion stats
     * (ticketCount, doneCount, completionPct).
     */
    list: ({ limit } = {}) => {
      const qs = limit ? `?limit=${encodeURIComponent(limit)}` : ''
      return this._call('tickets.cycle.list', `/tickets/cycle${qs}`)
    },

    /** Single cycle by id, with completion stats. */
    get: (cycleId) =>
      this._call('tickets.cycle.get', `/tickets/cycle/${encodeURIComponent(cycleId)}`),

    /** Create a cycle. Payload: { name, slug?, description?, startsAt?, endsAt?, status? }. */
    create: (payload = {}) =>
      this._call('tickets.cycle.create', '/tickets/cycle', {
        method: 'POST',
        body: payload || {}
      }),

    /** Update cycle metadata. Payload accepts name/description/startsAt/endsAt/slug. */
    update: (cycleId, payload = {}) =>
      this._call('tickets.cycle.update', `/tickets/cycle/${encodeURIComponent(cycleId)}`, {
        method: 'PUT',
        body: payload || {}
      }),

    /** Promote cycle to `active`. Atomically demotes any other active cycle in the org. */
    activate: (cycleId) =>
      this._call('tickets.cycle.activate', `/tickets/cycle/${encodeURIComponent(cycleId)}/activate`, {
        method: 'POST'
      }),

    /** Archive cycle. Tickets retain their cycleId so history is preserved. */
    archive: (cycleId) =>
      this._call('tickets.cycle.archive', `/tickets/cycle/${encodeURIComponent(cycleId)}/archive`, {
        method: 'POST'
      }),

    /** List tickets attached to a cycle. */
    listTickets: (cycleId) =>
      this._call('tickets.cycle.tickets.list', `/tickets/cycle/${encodeURIComponent(cycleId)}/tickets`),

    /** Attach a ticket to the cycle. Pass the human ticketId (e.g. 'TICKET-42'). */
    addTicket: (cycleId, ticketId) =>
      this._call('tickets.cycle.tickets.add', `/tickets/cycle/${encodeURIComponent(cycleId)}/tickets`, {
        method: 'POST',
        body: { ticketId }
      }),

    /** Detach a ticket from the cycle. */
    removeTicket: (cycleId, ticketId) =>
      this._call('tickets.cycle.tickets.remove', `/tickets/cycle/${encodeURIComponent(cycleId)}/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== COLUMNS SUB-NAMESPACE ====================

  columns = {
    /**
     * List all ticket columns (kanban board configuration).
     *
     * @returns {Promise<Array>} Array of column documents
     */
    list: () =>
      this._call('tickets.columns.list', '/tickets/columns'),

    /**
     * Update a column's properties (name, position, etc.).
     *
     * @param {string} key - Column key identifier
     * @param {object} payload - Properties to update
     * @returns {Promise<object>} Updated column document
     */
    update: (key, payload) =>
      this._call('tickets.columns.update', `/tickets/columns/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: payload
      })
  }

  // ==================== TYPE-SPECIFIC SUGAR ====================
  //
  // All discriminator types live in the same physical `tickets` collection
  // on the server (Mongoose discriminators). These namespaces are pure
  // ergonomic sugar around `list`/`get`/`create` with the `type` pre-filled.
  // Type-specific schema validation happens server-side.

  /**
   * Walk the parent-child tree starting from any ticket.
   * Returns { root, descendants[] } via server-side $graphLookup over
   * refs.parent. Works at any depth: epic → story → task → subtask.
   */
  tree (ticketId) {
    return this._call('tickets.tree', `/tickets/${encodeURIComponent(ticketId)}/tree`)
  }

  epics = {
    list: (options) => this.list({ type: 'epic' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'epic' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts),
    tree: (ticketId) => this.tree(ticketId),
    /** Direct children of an epic (user stories). */
    stories: (ticketId) =>
      this.list({ type: 'user_story', 'refs.parent': ticketId })
  }

  stories = {
    list: (options) => this.list({ type: 'user_story' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'user_story' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts),
    /** Direct children of a user story (tasks + bugs). */
    children: (ticketId) =>
      this.list({ type: { $in: ['task', 'bug'] }, 'refs.parent': ticketId })
  }

  tasks = {
    list: (options) => this.list({ type: 'task' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'task' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts)
  }

  bugs = {
    list: (options) => this.list({ type: 'bug' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'bug' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts)
  }

  spikes = {
    list: (options) => this.list({ type: 'spike' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'spike' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts)
  }

  decisions = {
    list: (options) => this.list({ type: 'decision' }, options),
    get: (ticketId) => this.get(ticketId),
    create: (payload) => this.create({ ...payload, type: 'decision' }),
    update: (ticketId, payload, opts) => this.update(ticketId, payload, opts)
  }

  // ==================== RESOLUTIONS ====================

  /**
   * List resolved tickets — done tickets with a non-null resolution blob.
   * Server-side equivalent of the former Supabase v_resolutions view.
   *
   * @param {object} [opts]
   * @param {number} [opts.limit=100]
   * @param {number} [opts.skip=0]
   * @returns {Promise<Array>} Array of resolution row objects
   */
  resolutions ({ limit = 100, skip = 0, workspaceId } = {}) {
    const params = new URLSearchParams()
    if (limit !== 100) params.set('limit', String(limit))
    if (skip) params.set('skip', String(skip))
    const wid = workspaceId || this._workspaceScope()
    if (wid) params.set('workspaceId', wid)
    const qs = params.toString()
    return this._call('tickets.resolutions', `/tickets/resolutions${qs ? `?${qs}` : ''}`)
  }

  // ==================== ATTACHMENTS ====================

  attachments = {
    /**
     * Upload a file attachment to a ticket.
     * Sends multipart/form-data; the server stores the file and appends the
     * attachment record to the ticket's attachments array.
     *
     * @param {string} ticketId - The ticket's ticketId slug (e.g. 'SMBLS-42')
     * @param {File} file - Browser File object to upload
     * @returns {Promise<{attachments: Array}>} Updated attachments array
     */
    upload: (ticketId, file) => {
      const formData = new FormData()
      formData.append('file', file)
      return this._call(
        'tickets.attachments.upload',
        `/tickets/${encodeURIComponent(ticketId)}/attachments`,
        { method: 'POST', body: formData }
      )
    },

    /**
     * List attachments for a ticket.
     *
     * @param {string} ticketId - The ticket's ticketId slug
     * @returns {Promise<Array>} Array of attachment documents
     */
    list: (ticketId) =>
      this._call(
        'tickets.attachments.list',
        `/tickets/${encodeURIComponent(ticketId)}/attachments`
      ),

    /**
     * Remove an attachment from a ticket.
     *
     * @param {string} ticketId - The ticket's ticketId slug
     * @param {string} attachmentId - Attachment MongoDB _id
     * @returns {Promise<{attachments: Array}>} Updated attachments array
     */
    remove: (ticketId, attachmentId) =>
      this._call(
        'tickets.attachments.remove',
        `/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE' }
      )
  }

  // ==================== REALTIME / SSE SUBSCRIPTION ====================

  /**
   * Subscribe to real-time ticket events via Server-Sent Events.
   *
   * Fires onEvent with shapes:
   *   { type: 'snapshot', tickets: [...] }   — initial load on connect
   *   { type: 'tickets.insert', ticket: {} }  — new ticket created
   *   { type: 'tickets.update', ticket: {} }  — ticket updated
   *   { type: 'tickets.delete', ticket: {} }  — ticket deleted
   *
   * Auto-reconnects on disconnect with exponential backoff (1s → 2s → 4s → 8s cap).
   * Returns an unsubscribe() function that tears down the connection.
   *
   * Works in both browser (native EventSource) and Node.js (optional
   * `eventsource` npm package as optionalDependency).
   *
   * @param {object} filter - Filter to scope the stream (ownerOrganization, project, etc.)
   * @param {function} onEvent - Callback fired for each event
   * @returns {function} unsubscribe() — call to close the connection
   */
  subscribe (filter = {}, onEvent) {
    return this._sseSubscribe('/tickets/stream', filter, onEvent)
  }
}

export const createTicketService = config => new TicketService(config)
