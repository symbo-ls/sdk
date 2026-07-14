import { BaseService } from './BaseService.js'

// CompanyProfileService wraps the main server's /core/company-profile route
// (Mongo-backed) — the workspace's own business identity from
// WORKSPACE_DATA_MODEL §6.2, Phase 3. This is the tenant's legal/billing self
// (name, tax ids, addresses, branding) that stamps outbound agreements and
// invoices. Peer service to sdk.parties / sdk.invoices.
//
// A singleton per workspace — there is no /:id and no list/create/remove.
// `get` returns the profile or null; `update` PATCH-upserts it. Workspace-
// scoped server-side (claim fallback; explicit `workspaceId` threaded as a
// query param). GET is member-gated; the PATCH upsert is manager-gated
// (owner/admin).

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class CompanyProfileService extends BaseService {
  // GET /core/company-profile (member; the singleton profile or null).
  get ({ workspaceId } = {}) {
    return this._call('companyProfile.get', `/company-profile${_qs(workspaceId)}`)
  }

  // PATCH /core/company-profile (manager; upserts the singleton).
  // payload: { legalName, displayName, taxIds?, addresses?, branding?, ... }
  update (payload = {}, { workspaceId } = {}) {
    return this._call('companyProfile.update', `/company-profile${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }
}

export const createCompanyProfileService = config => new CompanyProfileService(config)
