import { BaseService } from './BaseService.js'

// DocService wraps the MAIN SERVER /docs/* routes (Mongo-backed).
// These are first-class main-server routes, NOT workspace-project worker
// routes — do NOT use _ws() here. All calls go through _call() which
// routes to ${apiUrl}/core/docs/*.
//
// Mongo `Doc` collection uses Mongoose discriminators on `type`:
//   document     — general document
//   kb_article   — knowledge-base article (+ summary, category, status, version)
//   note         — personal/team note (+ color)
//   user_document — user-scoped private doc (+ privacy — scoped by ownerUser)
//
// Architecture note (Phase 2 migration):
//   Old path: sdk.workspaceProject.documents.* → _ws() → /documents/* (Supabase)
//   New path: sdk.docs.* → _call() → /docs/* (main server, Mongo)
//
// Back-compat aliases on WorkspaceProjectService delegate to this service
// for one cutover cycle before being removed in Phase 3.
export class DocService extends BaseService {
  // ==================== DOC READS ====================

  /**
   * List docs matching filter and options.
   *
   * @param {object} filter - Filter criteria (type, ownerOrganization, 'refs.parent', etc.)
   * @param {object} options - Pagination/sort options (limit, offset, order, etc.)
   * @returns {Promise<{data: Array, count: number}>} Docs array + total count
   */
  list (filter = {}, options = {}) {
    return this._call('docs.list', '/docs/list', {
      method: 'POST',
      body: { filter, options }
    })
  }

  /**
   * Get a single doc by ID.
   *
   * @param {string} docId - MongoDB ObjectId
   * @returns {Promise<object>} Doc document
   */
  get (docId) {
    return this._call('docs.get', `/docs/${encodeURIComponent(docId)}`)
  }

  /**
   * Get the parent-child tree for a doc via $graphLookup over refs.parent.
   * Returns { root, descendants[] } — works at any depth.
   *
   * @param {string} docId - Root doc ID
   * @returns {Promise<{root: object, descendants: Array}>}
   */
  tree (docId) {
    return this._call('docs.tree', `/docs/${encodeURIComponent(docId)}/tree`)
  }

  /**
   * Get folder tree aggregation for the current organization.
   * Returns hierarchical folder structure derived from refs.parent grouping.
   *
   * @returns {Promise<Array>} Folder tree
   */
  folders () {
    return this._call('docs.folders', '/docs/folders')
  }

  // ==================== DOC WRITES ====================

  /**
   * Create a doc. Accepts either a JSON payload object or a markdown string.
   *
   * JSON shape:
   *   create({ title: 'My Doc', type: 'document', body: '...' })
   *
   * Markdown shape (Content-Type: text/markdown):
   *   create('# My Doc\n\nbody text here')
   *
   * @param {object|string} payload - Doc data or raw markdown string
   * @returns {Promise<object>} Created doc document
   */
  create (payload) {
    if (typeof payload === 'string') {
      return this._call('docs.create', '/docs', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'text/markdown' }
      })
    }
    return this._call('docs.create', '/docs', {
      method: 'POST',
      body: { payload }
    })
  }

  /**
   * Update a doc. Accepts JSON or markdown. Supports optimistic concurrency
   * via the If-Match header (pass the doc's current bodyHash or ETag).
   * Server returns 412 Conflict when the hash doesn't match.
   *
   * @param {string} docId - Doc ID to update
   * @param {object|string} payload - Updated fields or raw markdown
   * @param {object} [opts]
   * @param {string} [opts.ifMatch] - Body hash / ETag for optimistic concurrency check
   * @returns {Promise<object>} Updated doc document
   */
  update (docId, payload, { ifMatch } = {}) {
    const headers = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    if (typeof payload === 'string') {
      headers['Content-Type'] = 'text/markdown'
      return this._call('docs.update', `/docs/${encodeURIComponent(docId)}`, {
        method: 'PUT',
        body: payload,
        headers
      })
    }
    return this._call('docs.update', `/docs/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      body: { payload },
      headers
    })
  }

  /**
   * Soft-delete a doc (sets state='archived' server-side).
   *
   * @param {string} docId - Doc ID to archive
   * @returns {Promise<null>}
   */
  remove (docId) {
    return this._call('docs.remove', `/docs/${encodeURIComponent(docId)}`, {
      method: 'DELETE'
    })
  }

  // ==================== REALTIME / SSE SUBSCRIPTION ====================

  /**
   * Subscribe to real-time doc events via Server-Sent Events.
   *
   * Auto-reconnects on disconnect with exponential backoff (1s → 2s → 4s → 8s cap).
   * Returns an unsubscribe() function that tears down the connection.
   *
   * @param {object} filter - Filter to scope the stream (ownerOrganization, type, etc.)
   * @param {function} onEvent - Callback fired for each event
   * @returns {function} unsubscribe() — call to close the connection
   */
  subscribe (filter = {}, onEvent) {
    return this._sseSubscribe('/docs/stream', filter, onEvent)
  }

  // ==================== TYPE-SPECIFIC SUGAR ====================
  //
  // All discriminator types live in the same physical `docs` collection on
  // the server (Mongoose discriminators). These namespaces are pure ergonomic
  // sugar around `list`/`get`/`create`/`update` with `type` pre-filled.
  // Type-specific schema validation happens server-side.

  documents = {
    list: (options) => this.list({ type: 'document' }, options),
    get: (docId) => this.get(docId),
    create: (payload) => this.create({ ...payload, type: 'document' }),
    update: (docId, payload, opts) => this.update(docId, payload, opts)
  }

  kbArticles = {
    list: (options) => this.list({ type: 'kb_article' }, options),
    get: (docId) => this.get(docId),
    create: (payload) => this.create({ ...payload, type: 'kb_article' }),
    update: (docId, payload, opts) => this.update(docId, payload, opts),
    /** Direct children of a KB article. */
    children: (docId) => this.list({ 'refs.parent': docId })
  }

  notes = {
    list: (options) => this.list({ type: 'note' }, options),
    get: (docId) => this.get(docId),
    create: (payload) => this.create({ ...payload, type: 'note' }),
    update: (docId, payload, opts) => this.update(docId, payload, opts)
  }

  userDocs = {
    list: (options) => this.list({ type: 'user_document' }, options),
    get: (docId) => this.get(docId),
    create: (payload) => this.create({ ...payload, type: 'user_document' }),
    update: (docId, payload, opts) => this.update(docId, payload, opts)
  }
}

export const createDocService = config => new DocService(config)
