import { BaseService } from './BaseService.js'

// ProposedActionService wraps the main server's /core/proposed-actions/*
// routes (Mongo-backed) — the approval spine from WORKSPACE_DATA_MODEL
// §6.6/§6.8, Phase 1. Peer service to sdk.tickets / sdk.docs / sdk.analyzed.
//
// Every route is workspace-scoped server-side: the workspace is resolved
// from the caller's active-workspace claim, so imperative callers may omit
// workspaceId and rely on the claim (declarative `fetch:` always does).
// An explicit `workspaceId` is threaded as a query param when a caller
// needs to target a specific workspace — the server's workspaceScope
// middleware reads `?workspaceId=` first, then falls back to the claim, and
// verifies membership either way (a foreign id fails closed 403).
//
// Approval contract: a ProposedAction is created in status 'proposed';
// approve/reject transition it (409 unless 'proposed'); result marks the
// approved action executed|failed (409 unless 'approved'). *Nothing runs
// until a human approves* — the AI-ownership invariant.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class ProposedActionService extends BaseService {
  // GET /core/proposed-actions?status=&entityType=&entityId=&actionKey=
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.status) extra.status = filter.status
    if (filter.entityType) extra.entityType = filter.entityType
    if (filter.entityId) extra.entityId = filter.entityId
    if (filter.actionKey) extra.actionKey = filter.actionKey
    const ws = filter.workspaceId || options.workspaceId
    return this._call('proposedActions.list', `/proposed-actions${_qs(ws, extra)}`)
  }

  // GET /core/proposed-actions/:id
  get (id, { workspaceId } = {}) {
    return this._call(
      'proposedActions.get',
      `/proposed-actions/${encodeURIComponent(id)}${_qs(workspaceId)}`
    )
  }

  // POST /core/proposed-actions — propose (any workspace member).
  // payload: { proposedBy?, thread?, actionKey, entityRef?, args?, summary?,
  //            risk?, expiresAt? } — the server stamps proposedBy from the
  //            caller unless kind 'agent' with an explicit id.
  propose (payload = {}, { workspaceId } = {}) {
    return this._call('proposedActions.propose', `/proposed-actions${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // Alias — the dispatcher's `create` op resolves here.
  create (payload = {}, opts = {}) {
    return this.propose(payload, opts)
  }

  // POST /core/proposed-actions/:id/approve (editor+; 409 unless 'proposed').
  approve (id, { workspaceId } = {}) {
    return this._call(
      'proposedActions.approve',
      `/proposed-actions/${encodeURIComponent(id)}/approve${_qs(workspaceId)}`,
      { method: 'POST', body: {} }
    )
  }

  // POST /core/proposed-actions/:id/reject (editor+; 409 unless 'proposed').
  reject (id, { workspaceId } = {}) {
    return this._call(
      'proposedActions.reject',
      `/proposed-actions/${encodeURIComponent(id)}/reject${_qs(workspaceId)}`,
      { method: 'POST', body: {} }
    )
  }

  // POST /core/proposed-actions/:id/result (editor+; 409 unless 'approved').
  // payload: { status: 'executed' | 'failed', result?, error? }.
  setResult (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'proposedActions.setResult',
      `/proposed-actions/${encodeURIComponent(id)}/result${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }
}

export const createProposedActionService = config => new ProposedActionService(config)
