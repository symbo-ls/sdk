import { BaseService } from './BaseService.js'

// TransactionService wraps the main server's /core/transactions/* routes
// (Mongo-backed) — "the money movement + settlement" from
// WORKSPACE_DATA_MODEL §6.4/§14.9, Phase 3. POST create runs the allocation
// settlement: the payload carries `allocations` that apply the transaction
// against one or more invoices. PATCH touches only reconciledAt/note
// (allocations are immutable post-create); DELETE 409s when the transaction
// settled invoices, else tombstones. Peer service to sdk.invoices.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Reads are
// member-gated; writes require workspace editor.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class TransactionService extends BaseService {
  // GET /core/transactions?kind=&partyId=&invoiceId=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    if (filter.partyId) extra.partyId = filter.partyId
    if (filter.invoiceId) extra.invoiceId = filter.invoiceId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('transactions.list', `/transactions${_qs(ws, extra)}`)
  }

  // GET /core/transactions/:id
  get (id, { workspaceId } = {}) {
    return this._call('transactions.get', `/transactions/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/transactions (editor; runs the allocation settlement — §14.9).
  // payload: { kind, partyId?, amount, currency, occurredAt?, method?,
  //            allocations?: [{ invoiceId, amount }], note?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('transactions.create', `/transactions${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/transactions/:id (editor; reconciledAt/note only —
  // allocations immutable post-create).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('transactions.update', `/transactions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/transactions/:id (editor; 409 if it has allocations, else
  // tombstone).
  remove (id, { workspaceId } = {}) {
    return this._call('transactions.remove', `/transactions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createTransactionService = config => new TransactionService(config)
