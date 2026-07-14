import { BaseService } from './BaseService.js'

// AgreementService wraps the main server's /core/agreements/* routes (Mongo-
// backed) — "the promise" from WORKSPACE_DATA_MODEL §6.4, Phase 3: a
// quote/order/contract/subscription between the workspace and a Party. The
// store assigns an immutable AGR- number on create and re-derives `total`
// from lines. Peer service to sdk.invoices / sdk.transactions.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Reads are
// member-gated; writes require workspace editor. DELETE is a tombstone, never
// a hard delete.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class AgreementService extends BaseService {
  // GET /core/agreements?kind=&status=&partyId=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    if (filter.status) extra.status = filter.status
    if (filter.partyId) extra.partyId = filter.partyId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('agreements.list', `/agreements${_qs(ws, extra)}`)
  }

  // GET /core/agreements/:id
  get (id, { workspaceId } = {}) {
    return this._call('agreements.get', `/agreements/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/agreements (editor; assigns immutable AGR- number).
  // payload: { kind, partyId, lines[], currency?, status?, validUntil?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('agreements.create', `/agreements${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/agreements/:id (editor; number stripped, total re-derived).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('agreements.update', `/agreements/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/agreements/:id (editor; tombstone, never hard).
  remove (id, { workspaceId } = {}) {
    return this._call('agreements.remove', `/agreements/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createAgreementService = config => new AgreementService(config)
