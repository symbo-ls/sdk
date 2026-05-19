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
   * List tickets matching filter and options.
   *
   * @param {object} filter - Filter criteria (ownerOrganization, project, state, assignee, etc.)
   * @param {object} options - Pagination/sort options (limit, offset, order, etc.)
   * @returns {Promise<Array>} Array of ticket documents
   */
  list (filter = {}, options = {}) {
    return this._call('tickets.list', '/tickets/list', {
      method: 'POST',
      body: { filter, options }
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
    return this._call('tickets.epicCounts', '/tickets/epic-counts')
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
    if (typeof payload === 'string') {
      headers['Content-Type'] = 'text/markdown'
      return this._call('tickets.update', `/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'PUT',
        body: payload,
        headers
      })
    }
    return this._call('tickets.update', `/tickets/${encodeURIComponent(ticketId)}`, {
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
    return this._call('tickets.remove', `/tickets/${encodeURIComponent(ticketId)}`, {
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
