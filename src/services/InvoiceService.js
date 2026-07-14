import { BaseService } from './BaseService.js'

// InvoiceService wraps the main server's /core/invoices/* routes (Mongo-
// backed) — "the billing document" from WORKSPACE_DATA_MODEL §6.4, Phase 3.
// The store assigns an immutable INV- number on create; `issue` transitions
// a draft → open and stamps issuedAt. Financial rows are never hard-deleted:
// `remove` maps to the server's VOID (§14.8). Peer service to
// sdk.agreements / sdk.transactions.
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

export class InvoiceService extends BaseService {
  // GET /core/invoices?direction=&status=&partyId=&overdue=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.direction) extra.direction = filter.direction
    if (filter.status) extra.status = filter.status
    if (filter.partyId) extra.partyId = filter.partyId
    if (filter.overdue || options.overdue) extra.overdue = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('invoices.list', `/invoices${_qs(ws, extra)}`)
  }

  // GET /core/invoices/:id
  get (id, { workspaceId } = {}) {
    return this._call('invoices.get', `/invoices/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/invoices (editor; assigns immutable INV- number).
  // payload: { direction, partyId, lines[], currency?, agreementId?, dueAt?, ... }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('invoices.create', `/invoices${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/invoices/:id (editor; number/amountPaid stripped).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('invoices.update', `/invoices/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // POST /core/invoices/:id/issue (editor; draft → open, stamp issuedAt).
  issue (id, { workspaceId } = {}) {
    return this._call('invoices.issue', `/invoices/${encodeURIComponent(id)}/issue${_qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // DELETE /core/invoices/:id (editor; VOID — financial rows are never
  // hard-deleted, §14.8).
  remove (id, { workspaceId } = {}) {
    return this._call('invoices.remove', `/invoices/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createInvoiceService = config => new InvoiceService(config)
