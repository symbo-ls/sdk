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
//   fieldRules: { lead?: {...} | null, deal?: {...} | null } (CRM 1.5)
//     { value: { read: 'perm:crm.finance.view', write: 'perm:crm.price.change' },
//       custom: { budget: { read: 'admin' } } }
//     read: member | own | admin | perm:<key>; write: editor | admin | server
//     | perm:<key>. Rule-bearing core fields: value, probability,
//     expectedCloseAt, attribution, sourceChannel. Enforced server-side
//     (stripped on read, 400 field_not_writable on write). A patch replaces
//     one kind's map; null clears it.
// GET is member-gated; PATCH is admin-gated and validates a closed shape.
//
// Permissions (`GET /core/crm/permissions`): this workspace org's permission
// catalog — the platform keys (crm.*, admin.*, …) plus the keys declared by
// installed apps (e.g. re.price.change) — [{ key, label, description, group,
// source: 'platform' | 'app:<owner>/<key>' }].

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

  // GET /core/crm/permissions → the org's permission catalog (see above).
  permissions ({ workspaceId } = {}) {
    return this._call('crm.permissions', `/crm/permissions${qs({ workspaceId })}`)
  }

  // POST /core/crm/migrations/crm-deals (workspace admin) — move this
  // workspace's crm_deals records onto Deal entities (CRM 1.2). DRY RUN unless
  // { apply: true }; idempotent (a second apply creates nothing); the records
  // are never touched. → { dryRun, scanned, created, skipped, failed,
  // warnings, plan }
  migrateCrmDeals ({ apply = false } = {}, { workspaceId } = {}) {
    return this._call(
      'crm.migrateCrmDeals',
      `/crm/migrations/crm-deals${qs({ workspaceId })}`,
      { method: 'POST', body: { apply: apply === true } }
    )
  }
}

export const createCrmService = config => new CrmService(config)
