import { BaseService } from './BaseService.js'
// `qs` keeps each path a literal template the server's route-drift analyzer
// can read (it drops `${qs(...)}` holes).
import { crmQuery as qs } from './_crmQuery.js'

// CrmService wraps /core/crm/* — the workspace-level CRM surfaces that are not
// one entity's (leads/deals live on LeadService/DealService).
//
// Settings (`Workspace.settings.crm`):
//   visibility: { lead: 'all'|'own', deal: 'all'|'own' }
//     'all' (the default — Nika 2026-09-28, "all members read deals and
//     leads") every member sees every row; 'own' switches owner-based access
//     on (owner / creator / workspace admin / crm.<kind>s.view_all).
// GET is member-gated; PATCH is admin-gated and validates a closed shape.

export class CrmService extends BaseService {
  // GET /core/crm/settings → { visibility: { lead, deal } }
  getSettings ({ workspaceId } = {}) {
    return this._call('crm.getSettings', `/crm/settings${qs({ workspaceId })}`)
  }

  // PATCH /core/crm/settings (admin) — e.g. { visibility: { deal: 'own' } }.
  // Answers the full, merged settings.
  updateSettings (patch = {}, { workspaceId } = {}) {
    return this._call('crm.updateSettings', `/crm/settings${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: patch
    })
  }
}

export const createCrmService = config => new CrmService(config)
