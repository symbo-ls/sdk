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

// A created-range bound: a Date goes as ISO-8601, anything else as given
// (the server parses it and answers 400 on a bad one).
const _bound = (v) => (v instanceof Date ? v.toISOString() : String(v))

export class AgreementService extends BaseService {
  // GET /core/agreements?kind=&status=&partyId=&q=&createdFrom=&createdTo=
  //   &updatedFrom=&updatedTo=&custom.<key>=<value>
  // q matches number + title (plain text); the created and updated ranges
  // are inclusive (G-L, APP-FAMILY-CONTRACT §4). `custom: { key: value }` is
  // an equality per key on a field the workspace declared for agreements
  // (a field definition, entityType 'agreement'); the server reads the value
  // as the field's type, so a boolean or a number goes as text. An
  // undeclared key answers 400 field_not_declared. A server without these
  // filters ignores them: keep the row rule on the client.
  list (filter = {}, options = {}) {
    filter = filter || {}
    const extra = {}
    if (filter.kind) extra.kind = filter.kind
    if (filter.status) extra.status = filter.status
    if (filter.partyId) extra.partyId = filter.partyId
    if (filter.q) extra.q = filter.q
    if (filter.createdFrom) extra.createdFrom = _bound(filter.createdFrom)
    if (filter.createdTo) extra.createdTo = _bound(filter.createdTo)
    if (filter.updatedFrom) extra.updatedFrom = _bound(filter.updatedFrom)
    if (filter.updatedTo) extra.updatedTo = _bound(filter.updatedTo)
    if (filter.custom && typeof filter.custom === 'object') {
      for (const [key, value] of Object.entries(filter.custom)) {
        if (value === undefined || value === null || value === '') continue
        extra[`custom.${key}`] = String(value)
      }
    }
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
  // G-L payload keys: `expect: { status?, updatedAt? }` (a mismatch throws
  // with err.status 409, err.cause.error 'agreement_changed' and
  // err.cause.current { status, updatedAt }); `customPatch` merges top-level
  // custom keys (null removes one); `party` while draft; status 'cancelled'
  // + `cancelReason`.
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
