import { BaseService } from './BaseService.js'
// `qs` (not a bare `const url`) keeps every path a literal template the
// server's route-drift analyzer can read — it drops `${qs(...)}` holes.
import { crmQuery as qs, crmRows } from './_crmQuery.js'

// DealService wraps the main server's /core/deals/* routes — Deal as a
// registered server entity (CRM core, roadmap 1.1): a sales opportunity with
// a value, moving through a pipeline (a Workflow with appliesTo 'deal').
//
// Workspace-scoped server-side (explicit `workspaceId` rides as a query
// param, else the active-workspace claim). Reads are member-gated, writes
// editor-gated; ROW visibility is the server's: the owner, the creator, a
// workspace admin, or a holder of `crm.deals.view_all` — an invisible deal is
// a 404, never a 403. DELETE tombstones.
//
// Money is integer MINOR units: value = { value: 45000000, currency: 'GEL' }.
// Stage moves are plain updates ({ stage }); the server derives the outcome
// status from the stage category (done → won, cancelled → lost), records the
// §7 timeline, and answers 409 stale_transition on a concurrent move.

export class DealService extends BaseService {
  // GET /core/deals — server-side filters, sort, paging. Returns the rows
  // array with `.pagination` = { page, limit, offset, totalCount, pages,
  // hasMore } attached. filter/options: see _crmQuery.js.
  async list (filter = {}, options = {}) {
    this._requireReady('deals.list')
    const response = await this._request(`/deals${qs(filter, options)}`, {
      method: 'GET',
      methodName: 'deals.list'
    })
    return crmRows(response, 'deals.list')
  }

  // GET /core/deals/summary — per-stage / per-status counts and values
  // (summed per currency), over the same filters as list.
  summary (filter = {}, options = {}) {
    return this._call('deals.summary', `/deals/summary${qs(filter, options)}`)
  }

  // GET /core/deals/pipelines — this workspace's deal pipelines (the default
  // one is provisioned on first read).
  pipelines ({ workspaceId } = {}) {
    return this._call('deals.pipelines', `/deals/pipelines${qs({ workspaceId })}`)
  }

  // GET /core/deals/:id
  get (id, { workspaceId } = {}) {
    return this._call('deals.get', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`)
  }

  // POST /core/deals (editor).
  // payload: { title, party?, company?, pipeline?, stage?, owner?, value?,
  //   probability?, expectedCloseAt?, sourceChannel?, attribution?,
  //   dimensions?, custom?, stageOrder?, description?, contactName? }
  //   contactName defaults to the linked party's name.
  create (payload = {}, { workspaceId } = {}) {
    return this._call('deals.create', `/deals${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/deals/:id (editor). Any writable field, plus the lifecycle:
  // { stage, pipeline, status: 'open'|'won'|'lost', lossReason: { key?, note? },
  //   owner, stageOrder }.
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('deals.update', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // Board move — PATCH { stage[, pipeline, stageOrder] }.
  move (id, { stage, pipeline, stageOrder } = {}, { workspaceId } = {}) {
    const body = { stage }
    if (pipeline !== undefined) body.pipeline = pipeline
    if (stageOrder !== undefined) body.stageOrder = stageOrder
    return this._call('deals.move', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body
    })
  }

  // Mark won at the current stage — PATCH { status: 'won' }.
  markWon (id, { workspaceId } = {}) {
    return this._call('deals.markWon', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: { status: 'won' }
    })
  }

  // Mark lost at the current stage — PATCH { status: 'lost', lossReason }.
  // lossReason: { key? (one of the pipeline's lossReasons), note? }.
  markLost (id, lossReason = null, { workspaceId } = {}) {
    return this._call('deals.markLost', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: { status: 'lost', lossReason }
    })
  }

  // POST /core/deals/:id/reopen (editor) — a won/lost deal back into the
  // pipeline; `stage` optional (default: the stage it was lost from).
  reopen (id, { stage } = {}, { workspaceId } = {}) {
    return this._call(
      'deals.reopen',
      `/deals/${encodeURIComponent(id)}/reopen${qs({ workspaceId })}`,
      { method: 'POST', body: stage ? { stage } : {} }
    )
  }

  // DELETE /core/deals/:id (editor; tombstone).
  remove (id, { workspaceId } = {}) {
    return this._call('deals.remove', `/deals/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'DELETE'
    })
  }
}

export const createDealService = config => new DealService(config)
