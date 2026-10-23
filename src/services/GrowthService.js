import { BaseService } from './BaseService.js'

// GrowthService — the Symbols sign-up funnel (landing → Fly → workspace), read
// by the Growth app (system/growth-app, installed in the system org's
// workspace). fly docs/FUNNEL.md §3: two reads on the main API server —
//
//   GET /core/growth/funnel    the funnel F0 → F9 for a window: counts, step
//                              conversion, drop-off — by source / campaign /
//                              entry page / surface / industry / device —
//                              time between stages, where people stopped
//   GET /core/growth/accounts  per-account funnel state; the stalled list
//                              (signed up, not activated in 7 days;
//                              provisioning errors) with each CRM contact
//
// Both are SYSTEM-ORG ONLY on the server (requireSymbolsSystemOrg); any other
// caller gets the server's refusal, which _call throws with its message.
//
// And one read for a workspace's OWN members (fly docs/FUNNEL.md §4 G5, the
// first-run checklist): GET /core/workspaces/:workspaceId/activation — the
// workspace's progress on the activation rule (the same rule as the funnel's
// F8: a teammate invited, 5+ records, the website published, 3+ AI asks —
// within 7 days of the workspace's creation). Any member may read it.
//
// The server owns the query vocabulary (window, grouping, stage filters,
// paging), so this service adds no params of its own and drops none it does
// not know: every own field of the filter bag whose key looks like an
// identifier and whose value is a scalar goes out as a query param — a Date
// as ISO, an array of scalars joined with ',', a number / boolean as text;
// null, undefined, '' and non-finite numbers are omitted; objects and
// functions are dropped. A bare 'YYYY-MM-DD' is sent as is (the server reads
// it in `tz`, like AnalyzedService.funnel).
//
// Reached as sdk.getService('growth').funnel(filter) /
// .accounts(filter, options) / .activation(workspaceId), or
// sdk.execute('growth', 'funnel' | 'accounts' | 'activation', args) and the
// declarative entities 'growth.funnel' / 'growth.accounts' /
// 'growth.activation' (EntityDispatcher).

const PARAM_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const PAGING_KEYS = ['limit', 'offset', 'order', 'sort']

const _scalarParam = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return String(value)
  return null
}

const _param = (value) => {
  if (!Array.isArray(value)) return _scalarParam(value)
  const parts = value.map(_scalarParam).filter((v) => v !== null)
  return parts.length ? parts.join(',') : null
}

const _setParams = (params, bag) => {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return
  for (const key of Object.keys(bag)) {
    if (!PARAM_KEY_RE.test(key)) continue
    const value = _param(bag[key])
    if (value !== null) params.set(key, value)
  }
}

export class GrowthService extends BaseService {
  // GET /core/growth/funnel?<filter>
  funnel (filter = {}) {
    const params = new URLSearchParams()
    _setParams(params, filter)
    const qs = params.toString()
    return this._call('growth.funnel', `/growth/funnel${qs ? `?${qs}` : ''}`)
  }

  // GET /core/growth/accounts?<filter>&limit=&offset=&order=&sort=
  accounts (filter = {}, options = {}) {
    const params = new URLSearchParams()
    _setParams(params, filter)
    for (const key of PAGING_KEYS) {
      const value = _scalarParam(options?.[key])
      if (value !== null) params.set(key, value)
    }
    const qs = params.toString()
    return this._call('growth.accounts', `/growth/accounts${qs ? `?${qs}` : ''}`)
  }

  // GET /core/workspaces/:workspaceId/activation →
  //   { workspaceId, since, windowEndsAt, steps: { invited, records: { count,
  //     needed }, sitePublished, aiAsks: { count, needed } }, activated,
  //     activatedAt, activatedBy, activationDays }
  activation (workspaceId) {
    const id = workspaceId === null || workspaceId === undefined ? '' : String(workspaceId).trim()
    if (!id) return Promise.reject(new Error('growth.activation: workspaceId is required'))
    return this._call('growth.activation', `/workspaces/${encodeURIComponent(id)}/activation`)
  }
}

export default GrowthService
