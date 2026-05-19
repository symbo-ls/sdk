// ResourceLinkService wraps the MAIN SERVER /resource-links/* routes.
// Junction table for cross-resource associations between chat_channel,
// meet_room, and calendar_event entities. Created/removed atomically;
// canonical ordering enforced server-side so callers can pass either
// direction (A→B or B→A) and get the same row.

import { BaseService } from './BaseService.js'

export class ResourceLinkService extends BaseService {
  /**
   * List resource links. Optional filter `{type, id}` returns only links
   * touching that resource (matches either a-side or b-side).
   */
  list ({ type, id } = {}) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (id) params.set('id', id)
    const qs = params.toString()
    return this._call('resourceLinks.list', `/resource-links${qs ? '?' + qs : ''}`)
  }

  /**
   * Create a link between two resources. Server canonicalizes ordering +
   * is idempotent — duplicate pairs return the existing row with
   * `existed: true` rather than 409.
   */
  create ({ aType, aId, bType, bId } = {}) {
    return this._call('resourceLinks.create', '/resource-links', {
      method: 'POST',
      body: { aType, aId, bType, bId }
    })
  }

  /** Remove a link by Mongo _id. */
  remove (id) {
    return this._call('resourceLinks.remove', `/resource-links/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }

  /**
   * Remove a link by its canonical pair (order-insensitive — server
   * canonicalizes before lookup, so callers can pass either direction).
   */
  removeByPair ({ aType, aId, bType, bId } = {}) {
    return this._call('resourceLinks.removeByPair', '/resource-links/pair', {
      method: 'DELETE',
      body: { aType, aId, bType, bId }
    })
  }
}

export const createResourceLinkService = config => new ResourceLinkService(config)
