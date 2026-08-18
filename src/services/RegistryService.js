import { BaseService } from './BaseService.js'

// RegistryService wraps the main server's /core/registry/* routes — the
// external company-registry proxy (bellforge D2-1). The server owns the
// provider chain (Pappers keyed → official keyless
// recherche-entreprises.api.gouv.fr → honest 502), the 1h cache, TEST_ECHO
// fixtures and normalization to ONE provider-agnostic wire row; this service
// is a thin authenticated reach. Not workspace-scoped (no tenant data) —
// public registry data, authed so it rides the server's cache + keys.
//
// Reached via sdk.getService('registry') (workspace shell module bridge) —
// no EntityDispatcher entity: modules consume it through the capability-
// gated `moduleRegistryLookup` context fn, never declaratively.
export class RegistryService extends BaseService {
  // GET /core/registry/fr/status → { mode: 'live'|'test', providers: {…} }
  frStatus () {
    return this._call('registry.frStatus', '/registry/fr/status')
  }

  // GET /core/registry/fr/search?q=&limit= → { rows: […], provider }
  frSearch (q, { limit } = {}) {
    const params = new URLSearchParams({ q: String(q ?? '') })
    if (limit != null) params.set('limit', String(limit))
    return this._call('registry.frSearch', `/registry/fr/search?${params.toString()}`)
  }

  // GET /core/registry/fr/company/:siren → { company: {…}, provider }
  frCompany (siren) {
    return this._call(
      'registry.frCompany',
      `/registry/fr/company/${encodeURIComponent(String(siren ?? ''))}`
    )
  }
}
