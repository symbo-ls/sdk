import { BaseService } from './BaseService.js'

// WorkflowService wraps the main server's /core/workflows/* routes (Mongo-
// backed) — the one stage-sequence mechanism from WORKSPACE_DATA_MODEL §6.5
// that powers ticket boards, deal pipelines, content publishing, and any
// custom object's lifecycle. Peer service to sdk.tickets / sdk.docs.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see ProposedActionService for the contract).
// Reads are member-gated; writes require workspace owner/admin.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class WorkflowService extends BaseService {
  // GET /core/workflows?appliesTo=<entity type | record:key>
  list (filter = {}, options = {}) {
    const extra = {}
    if (filter.appliesTo) extra.appliesTo = filter.appliesTo
    const ws = filter.workspaceId || options.workspaceId
    return this._call('workflows.list', `/workflows${_qs(ws, extra)}`)
  }

  // GET /core/workflows/:id
  get (id, { workspaceId } = {}) {
    return this._call('workflows.get', `/workflows/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /core/workflows (owner/admin).
  // payload: { name, kind: 'status'|'pipeline', appliesTo, stages[], isDefault? }
  create (payload = {}, { workspaceId } = {}) {
    return this._call('workflows.create', `/workflows${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/workflows/:id (owner/admin).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('workflows.update', `/workflows/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/workflows/:id (owner/admin).
  remove (id, { workspaceId } = {}) {
    return this._call('workflows.remove', `/workflows/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }
}

export const createWorkflowService = config => new WorkflowService(config)
