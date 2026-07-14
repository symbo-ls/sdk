import { BaseService } from './BaseService.js'

// PriceService wraps the main server's /core/prices/* routes (Mongo-backed) —
// the catalog "product × currency × amount" from WORKSPACE_DATA_MODEL §6.3,
// Phase 3. A Price attaches to a Product in the same workspace (C3) and holds
// the money (minor units) for one currency. Peer service to sdk.products.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Reads are
// member-gated; writes require workspace editor. DELETE is a tombstone
// (archive), never a hard delete.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class PriceService extends BaseService {
  // GET /core/prices?productId=&active=&includeArchived=
  // `active` is tri-state: omit to list all, true|false to filter.
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.productId) extra.productId = filter.productId
    if (filter.active !== undefined) extra.active = String(filter.active)
    if (filter.includeArchived || options.includeArchived) extra.includeArchived = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('prices.list', `/prices${_qs(ws, extra)}`)
  }

  // GET /core/prices/:id
  get (id, { workspaceId } = {}) {
    return this._call('prices.get', `/prices/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/prices (editor).
  // payload: { product, currency, amount, interval?, active?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('prices.create', `/prices${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/prices/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('prices.update', `/prices/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/prices/:id (editor; tombstone/archive, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('prices.remove', `/prices/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createPriceService = config => new PriceService(config)
