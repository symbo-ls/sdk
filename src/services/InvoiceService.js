import { BaseService } from './BaseService.js'

// InvoiceService wraps the main server's /core/invoices/* routes (Mongo-
// backed) — "the billing document" from WORKSPACE_DATA_MODEL §6.4, Phase 3.
// The store assigns an immutable INV- number on create; `issue` transitions
// a draft → open and stamps issuedAt. Financial rows are never hard-deleted:
// `remove` maps to the server's VOID (§14.8); `void` voids WITH a reason.
// Credit notes (G-M, APP-FAMILY-CONTRACT §4): `createCreditNote` credits an
// issued invoice, `listCreditNotes` reads them back. An issued invoice keeps
// its lines, tax mode and party (a PATCH of them answers 409 'not_draft').
// Peer service to sdk.agreements / sdk.transactions.
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
  // GET /core/invoices?direction=&status=&partyId=&agreement=&overdue=
  // `agreement` (alias `agreementId`) lists the invoices that bill that
  // agreement — through the invoice's own link or any line's (G-M).
  list (filter = {}, options = {}) {
    filter = filter || {}
    const extra = {}
    if (filter.direction) extra.direction = filter.direction
    if (filter.status) extra.status = filter.status
    if (filter.partyId) extra.partyId = filter.partyId
    const agreement = filter.agreement || filter.agreementId
    if (agreement) extra.agreement = agreement
    if (filter.overdue || options.overdue) extra.overdue = 'true'
    const ws = filter.workspaceId || options.workspaceId
    return this._call('invoices.list', `/invoices${_qs(ws, extra)}`)
  }

  // GET /core/invoices/contract — the bounds the server enforces, read
  // BEFORE a write so no client hardcodes a copy: { voidReasonMaxLength }
  // (a void reason longer than that is a 400). Member-gated like every read.
  getContract ({ workspaceId } = {}) {
    return this._call('invoices.getContract', `/invoices/contract${_qs(workspaceId)}`)
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
  // hard-deleted, §14.8). No reason — `void` carries one.
  remove (id, { workspaceId } = {}) {
    return this._call('invoices.remove', `/invoices/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // POST /core/invoices/:id/void (editor; G-M) — void with a reason (free
  // text, ≤ 500 characters; the first void's reason stands).
  void (id, payload = {}, { workspaceId } = {}) {
    return this._call('invoices.void', `/invoices/${encodeURIComponent(id)}/void${_qs(workspaceId)}`, {
      method: 'POST',
      body: { reason: payload?.reason ?? null }
    })
  }

  // POST /core/invoices/:id/credit-notes (editor; G-M) — credit an issued
  // invoice. payload: { lines[] (negative unit amounts for what is credited;
  // a line may name the order line it credits: agreement + agreementLineKey),
  // notes?, category?, custom?, expectCredited? (the invoice's amountCredited
  // in minor units, as read — a mismatch throws with err.status 409,
  // 'credit_conflict') }. Resolves { creditNote, invoice } (the invoice after
  // the credit).
  createCreditNote (id, payload = {}, { workspaceId } = {}) {
    return this._call('invoices.createCreditNote', `/invoices/${encodeURIComponent(id)}/credit-notes${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // GET /core/invoices/:id/credit-notes (member; G-M) — newest first, void
  // ones included.
  listCreditNotes (id, { workspaceId } = {}) {
    return this._call('invoices.listCreditNotes', `/invoices/${encodeURIComponent(id)}/credit-notes${_qs(workspaceId)}`)
  }
}

export const createInvoiceService = config => new InvoiceService(config)
