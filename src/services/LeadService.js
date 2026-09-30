import { BaseService } from './BaseService.js'
// `qs` (not a bare `const url`) keeps every path a literal template the
// server's route-drift analyzer can read — it drops `${qs(...)}` holes.
import { crmQuery as qs, crmRows } from './_crmQuery.js'

// LeadService wraps the main server's /core/leads/* routes — Lead as a
// registered server entity (CRM core, roadmap 1.1): a potential customer
// moving through a lead pipeline (a Workflow with appliesTo 'lead'), closed
// as won, lost (with a reason) or CONVERTED into a Deal.
//
// Same contract as DealService (workspace scoping, member reads / editor
// writes, server-side row visibility — owner, creator, admin, or
// `crm.leads.view_all`), plus `convert`.

export class LeadService extends BaseService {
  // GET /core/leads — filters/sort/paging; rows + `.pagination`.
  async list (filter = {}, options = {}) {
    this._requireReady('leads.list')
    const response = await this._request(`/leads${qs(filter, options)}`, {
      method: 'GET',
      methodName: 'leads.list'
    })
    return crmRows(response, 'leads.list')
  }

  // GET /core/leads/summary
  summary (filter = {}, options = {}) {
    return this._call('leads.summary', `/leads/summary${qs(filter, options)}`)
  }

  // GET /core/leads/pipelines
  pipelines ({ workspaceId } = {}) {
    return this._call('leads.pipelines', `/leads/pipelines${qs({ workspaceId })}`)
  }

  // GET /core/leads/:id
  get (id, { workspaceId } = {}) {
    return this._call('leads.get', `/leads/${encodeURIComponent(id)}${qs({ workspaceId })}`)
  }

  // POST /core/leads (editor). payload: see DealService.create.
  create (payload = {}, { workspaceId } = {}) {
    return this._call('leads.create', `/leads${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/leads/:id (editor).
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('leads.update', `/leads/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // Board move — PATCH { stage[, pipeline, stageOrder] }.
  move (id, { stage, pipeline, stageOrder } = {}, { workspaceId } = {}) {
    const body = { stage }
    if (pipeline !== undefined) body.pipeline = pipeline
    if (stageOrder !== undefined) body.stageOrder = stageOrder
    return this._call('leads.move', `/leads/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body
    })
  }

  // Disqualify / lose — PATCH { status: 'lost', lossReason }.
  markLost (id, lossReason = null, { workspaceId } = {}) {
    return this._call('leads.markLost', `/leads/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: { status: 'lost', lossReason }
    })
  }

  // POST /core/leads/:id/reopen (editor).
  reopen (id, { stage } = {}, { workspaceId } = {}) {
    return this._call(
      'leads.reopen',
      `/leads/${encodeURIComponent(id)}/reopen${qs({ workspaceId })}`,
      { method: 'POST', body: stage ? { stage } : {} }
    )
  }

  // POST /core/leads/:id/convert (editor) → { lead, deal }. The deal inherits
  // the lead's party, company, owner, channel, attribution, dimensions and
  // value; payload may override { title, pipeline, stage, value, owner,
  // expectedCloseAt }.
  convert (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'leads.convert',
      `/leads/${encodeURIComponent(id)}/convert${qs({ workspaceId })}`,
      { method: 'POST', body: payload }
    )
  }

  // DELETE /core/leads/:id (editor; tombstone).
  remove (id, { workspaceId } = {}) {
    return this._call('leads.remove', `/leads/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'DELETE'
    })
  }

  // Live change stream — GET /core/leads/stream (SSE). A lead is a server
  // entity, not a records collection, so `records.subscribe` never covered
  // it: without this a new lead (website form, WhatsApp, SMS, manual) reached
  // a board only after a reload.
  //
  // Events (`onEvent(evt)`):
  //   { type: 'leads.open', at }                — once per connection, a
  //       reconnect included. RE-READ YOUR LIST on it: the stream keeps no
  //       backlog, so a change that happened while the connection was down
  //       arrives only through that re-read.
  //   { type: 'leads.change', id, action, at }  — action 'create' | 'update'
  //       (any field, a stage move, a repeat submission) | 'delete'. A
  //       REFERENCE, never row data: re-read through `get(id)` / `list()`,
  //       where visibility and field rules live.
  //
  // The server gates the stream exactly like `list`: workspace membership,
  // and per event the lead's row visibility for THIS member — no event ever
  // arrives for a lead `list` would hide. A member who loses sight of a lead
  // (it is reassigned away) gets no event for that change; the next
  // `leads.open` / list read converges.
  //
  // filter: { workspaceId } (defaults to the SDK's active workspace).
  // Returns unsubscribe().
  subscribe (filter = {}, onEvent) {
    if (typeof onEvent !== 'function') {
      throw new Error('leads.subscribe: onEvent must be a function')
    }
    const f = filter && typeof filter === 'object' ? filter : {}
    const workspaceId = f.workspaceId || this._context?.activeWorkspaceId
    let destroyed = false
    const deliver = (evt) => {
      if (destroyed) return
      try {
        onEvent(evt)
      } catch (_) {
        /* listener errors don't propagate into the stream */
      }
    }
    const unsub = this._sseSubscribe('/leads/stream', { workspaceId }, deliver, {
      flatParams: true,
      events: [
        { name: 'leads.open', frame: (data) => ({ type: 'leads.open', ...data }) },
        { name: 'leads.change', frame: (data) => ({ type: 'leads.change', ...data }) }
      ]
    })
    return () => {
      destroyed = true
      unsub()
    }
  }
}

export const createLeadService = config => new LeadService(config)
