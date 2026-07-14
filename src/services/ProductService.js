import { BaseService } from './BaseService.js'

// ProductService wraps the main server's /core/products/* routes (Mongo-
// backed) — the catalog "what the tenant sells" from WORKSPACE_DATA_MODEL
// §6.3, Phase 3. A Product is the sellable item (kind good | service |
// subscription | …); its money lives on peer Price rows (see PriceService).
// Peer service to sdk.parties / sdk.agreements / sdk.invoices.
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

export class ProductService extends BaseService {
  // GET /core/products?kind=&active=&q=&includeArchived=
  // `active` is tri-state: omit to list all, true|false to filter.
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    if (filter.active !== undefined) extra.active = String(filter.active)
    if (filter.q) extra.q = filter.q
    if (filter.includeArchived || options.includeArchived) extra.includeArchived = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('products.list', `/products${_qs(ws, extra)}`)
  }

  // GET /core/products/:id
  get (id, { workspaceId } = {}) {
    return this._call('products.get', `/products/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/products (editor).
  // payload: { kind, name, description?, category?, active?, custom?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('products.create', `/products${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/products/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('products.update', `/products/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/products/:id (editor; tombstone/archive, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('products.remove', `/products/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createProductService = config => new ProductService(config)
