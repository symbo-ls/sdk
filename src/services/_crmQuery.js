// Shared query builder for the CRM entity services (DealService,
// LeadService) — /core/deals and /core/leads take the SAME server-side
// filters, sort and paging (server: domains/crm/store/crmEntityStore.js
// buildCrmListFilter / parseCrmSort / parseCrmPaging).
//
// filter keys → query params, arrays joined with ',':
//   pipeline, stage[], status[], owner[] ('me' | 'none' | userId),
//   party, company, q, sourceChannel[], valueMin, valueMax (minor units),
//   currency, createdFrom/createdTo, expectedCloseFrom/expectedCloseTo,
//   closedFrom/closedTo, updatedSince, rotting, hasNextActivity,
//   includeArchived, dimensions: { <key>: value | value[] }
// options → limit, offset, page, sort ('value.desc,createdAt.asc'), workspaceId

const FILTER_KEYS = [
  'pipeline',
  'stage',
  'status',
  'owner',
  'party',
  'company',
  'q',
  'sourceChannel',
  'valueMin',
  'valueMax',
  'currency',
  'createdFrom',
  'createdTo',
  'expectedCloseFrom',
  'expectedCloseTo',
  'closedFrom',
  'closedTo',
  'updatedSince',
  'rotting',
  'hasNextActivity',
  'includeArchived'
]

const PAGING_KEYS = ['limit', 'offset', 'page', 'sort']

const _val = (v) => {
  if (Array.isArray(v)) return v.map(String).join(',')
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export const crmQuery = (filter = {}, options = {}) => {
  const params = new URLSearchParams()
  const f = filter && typeof filter === 'object' ? filter : {}
  const o = options && typeof options === 'object' ? options : {}
  for (const k of FILTER_KEYS) {
    if (f[k] !== undefined && f[k] !== null && f[k] !== '') params.set(k, _val(f[k]))
  }
  if (f.dimensions && typeof f.dimensions === 'object') {
    for (const [k, v] of Object.entries(f.dimensions)) {
      if (v !== undefined && v !== null && v !== '') params.set(`dimension.${k}`, _val(v))
    }
  }
  for (const k of PAGING_KEYS) {
    const v = o[k] !== undefined ? o[k] : f[k]
    if (v !== undefined && v !== null && v !== '') params.set(k, _val(v))
  }
  const ws = f.workspaceId || o.workspaceId
  if (ws) params.set('workspaceId', String(ws))
  const s = params.toString()
  return s ? `?${s}` : ''
}

// The list envelope is { success, data, pagination } — `pagination` is
// attached ONTO the returned array (the records.list convention), so
// Array.isArray / .map / for..of stay byte-identical for every consumer
// while a pager reads rows.pagination.{totalCount,hasMore,page,pages}.
export const crmRows = (response, methodName) => {
  if (!response || response.success === false) {
    throw new Error(response?.message || `${methodName} failed`)
  }
  const rows = Array.isArray(response.data) ? response.data : []
  if (response.pagination) rows.pagination = response.pagination
  return rows
}
