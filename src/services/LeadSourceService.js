import { BaseService } from './BaseService.js'

// LeadSourceService wraps the main server's /core/lead-sources/* routes —
// the CRM lead sources (CRM spec §5; roadmap 2.1 / 2.3 / 2.5 / 5.2):
//
//   sources       a workspace's intake channels — a generic signed webhook,
//                 a public web form, a Google Ads lead form, a CSV intake —
//                 with owner assignment (fixed / round robin / rules), field
//                 mapping and defaults. A webhook / Google Ads source's
//                 secret is returned ONCE (create, rotateSecret).
//   settings      settings.leadSources: the dedupe window, the default phone
//                 country (the +995 rule), retention, the Bitrix24 tables.
//   issues        the ingestion-issues inbox (§5.7): dead / failing events,
//                 fix hints, retry, bulk retry, a summary report.
//   imports       CSV (console presets) and Bitrix24 exports — a DRY RUN
//                 unless `dryRun: false`; runs can be read and undone.
//   submitForm    the PUBLIC web-form submit (no session needed) — what a
//                 form on a published site calls.
//
// Workspace scope: `workspaceId` rides the query string (reads = member,
// writes / issues / imports = workspace admin — enforced server-side).

// `qs` (a whole word) — the server route-drift analyzer drops `${qs(...)}`
// template holes, so every path below stays readable to it.
const qs = (params = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, Array.isArray(v) ? v.map(String).join(',') : v instanceof Date ? v.toISOString() : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

const ISSUE_FILTERS = ['status', 'source', 'reason', 'provider', 'importRun', 'since', 'until']

export class LeadSourceService extends BaseService {
  // ── sources ────────────────────────────────────────────────────────────

  // GET /core/lead-sources — filter: { type, status, includeArchived }.
  list (filter = {}, { workspaceId } = {}) {
    const { type, status, includeArchived } = filter || {}
    return this._call(
      'leadSources.list',
      `/lead-sources${qs({ type, status, includeArchived, workspaceId: workspaceId || filter?.workspaceId })}`
    )
  }

  // GET /core/lead-sources/:id
  get (id, { workspaceId } = {}) {
    return this._call('leadSources.get', `/lead-sources/${encodeURIComponent(id)}${qs({ workspaceId })}`)
  }

  // POST /core/lead-sources (admin) → { source, secret? }. payload: { type:
  // 'webhook'|'web_form'|'google_ads'|'csv', name, owner?, defaults?: {
  // pipeline, stage, sourceChannel, dimensions, country }, mapping?: [{ from,
  // to }], assignment?: { mode, owner, pool, team, rules }, dedupeWindowDays?,
  // retentionDays?, notifyOwner?, webForm?: { allowedOrigins, captcha,
  // honeypotField } }. Keep `secret` — it is never shown again.
  create (payload = {}, { workspaceId } = {}) {
    return this._call('leadSources.create', `/lead-sources${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/lead-sources/:id (admin) — status 'active' | 'paused'.
  update (id, payload = {}, { workspaceId } = {}) {
    return this._call('leadSources.update', `/lead-sources/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/lead-sources/:id (admin) — archives; the secret is deleted.
  archive (id, { workspaceId } = {}) {
    return this._call('leadSources.archive', `/lead-sources/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'DELETE'
    })
  }

  // POST /core/lead-sources/:id/rotate-secret (admin) → { source, secret }.
  rotateSecret (id, { workspaceId } = {}) {
    return this._call(
      'leadSources.rotateSecret',
      `/lead-sources/${encodeURIComponent(id)}/rotate-secret${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // POST /core/lead-sources/:id/test (admin) → { eventId }. `payload` is the
  // provider's shape for the source type; the lead is flagged isTest.
  sendTestLead (id, payload = {}, { workspaceId } = {}) {
    return this._call('leadSources.sendTestLead', `/lead-sources/${encodeURIComponent(id)}/test${qs({ workspaceId })}`, {
      method: 'POST',
      body: { payload }
    })
  }

  // ── settings + catalog ────────────────────────────────────────────────

  // GET /core/lead-sources/settings
  getSettings ({ workspaceId } = {}) {
    return this._call('leadSources.getSettings', `/lead-sources/settings${qs({ workspaceId })}`)
  }

  // PATCH /core/lead-sources/settings (admin) — { dedupeWindowDays,
  // defaultCountry, retentionDays, bitrix24: { stageMap, sourceMap, userMap,
  // pipeline, columnMap, fieldMap, timezone, dateOrder } }; null resets a key.
  updateSettings (patch = {}, { workspaceId } = {}) {
    return this._call('leadSources.updateSettings', `/lead-sources/settings${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: patch
    })
  }

  // GET /core/lead-sources/csv-presets → { presets, mappingTargets }.
  csvPresets ({ workspaceId } = {}) {
    return this._call('leadSources.csvPresets', `/lead-sources/csv-presets${qs({ workspaceId })}`)
  }

  // ── ingestion issues (§5.7) ───────────────────────────────────────────

  // GET /core/lead-sources/issues (admin) — rows with `.pagination`.
  // filter: { status ('dead,failed' default), source, reason, provider,
  // importRun, since, until }; options: { limit, offset }.
  async listIssues (filter = {}, options = {}) {
    this._requireReady('leadSources.listIssues')
    const params = {}
    for (const k of ISSUE_FILTERS) params[k] = filter?.[k]
    const response = await this._request(
      `/lead-sources/issues${qs({ ...params, limit: options.limit, offset: options.offset, workspaceId: options.workspaceId || filter?.workspaceId })}`,
      { method: 'GET', methodName: 'leadSources.listIssues' }
    )
    if (!response || response.success === false) {
      throw new Error(response?.message || 'leadSources.listIssues failed')
    }
    const rows = Array.isArray(response.data) ? response.data : []
    if (response.pagination) rows.pagination = response.pagination
    return rows
  }

  // GET /core/lead-sources/issues/summary (admin) → { total, bySource,
  // byReason, byAge }.
  issuesSummary (filter = {}, { workspaceId } = {}) {
    const params = {}
    for (const k of ISSUE_FILTERS) params[k] = filter?.[k]
    return this._call(
      'leadSources.issuesSummary',
      `/lead-sources/issues/summary${qs({ ...params, workspaceId: workspaceId || filter?.workspaceId })}`
    )
  }

  // POST /core/lead-sources/issues/:eventId/retry (admin).
  retryIssue (eventId, { workspaceId } = {}) {
    return this._call(
      'leadSources.retryIssue',
      `/lead-sources/issues/${encodeURIComponent(eventId)}/retry${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // POST /core/lead-sources/issues/retry (admin) — { ids } | { source,
  // reason } | { all: true } → { retried }.
  retryIssues (selection = {}, { workspaceId } = {}) {
    return this._call('leadSources.retryIssues', `/lead-sources/issues/retry${qs({ workspaceId })}`, {
      method: 'POST',
      body: selection
    })
  }

  // GET /core/lead-sources/events/:eventId (admin) — one event, payload included.
  getEvent (eventId, { workspaceId } = {}) {
    return this._call('leadSources.getEvent', `/lead-sources/events/${encodeURIComponent(eventId)}${qs({ workspaceId })}`)
  }

  // GET /core/lead-sources/leads/:leadId/touches — a lead's intake history.
  leadTouches (leadId, { workspaceId } = {}) {
    return this._call(
      'leadSources.leadTouches',
      `/lead-sources/leads/${encodeURIComponent(leadId)}/touches${qs({ workspaceId })}`
    )
  }

  // ── imports (§5.2) ────────────────────────────────────────────────────

  // POST /core/lead-sources/imports/csv (admin). body: { sourceId, preset
  // ('generic'|'meta'|'linkedin'|'google_ads'|'tiktok'), content (CSV text)
  // | contentBase64 (any file: CSV in any encoding, XLSX), fileName?,
  // mapping?, delimiter?, sheet?, dryRun }. A DRY RUN unless dryRun === false
  // → { dryRun, report[, importId, queued] }.
  importCsv (body = {}, { workspaceId } = {}) {
    return this._call('leadSources.importCsv', `/lead-sources/imports/csv${qs({ workspaceId })}`, {
      method: 'POST',
      body
    })
  }

  // POST /core/lead-sources/imports/bitrix24 (admin). body: { entity
  // ('companies'|'contacts'|'leads'|'deals'), content | contentBase64,
  // fileName?, dryRun, options?: { stageMap, sourceMap, userMap, pipeline,
  // columnMap, fieldMap, timezone, dateOrder, defaultOwner, currency,
  // defaultCountry, allowUnmappedStages } }. Import companies, contacts,
  // leads, then deals.
  importBitrix24 (body = {}, { workspaceId } = {}) {
    return this._call('leadSources.importBitrix24', `/lead-sources/imports/bitrix24${qs({ workspaceId })}`, {
      method: 'POST',
      body
    })
  }

  // GET /core/lead-sources/imports (admin) — filter: { kind, limit }.
  listImports (filter = {}, { workspaceId } = {}) {
    return this._call(
      'leadSources.listImports',
      `/lead-sources/imports${qs({ kind: filter?.kind, limit: filter?.limit, workspaceId: workspaceId || filter?.workspaceId })}`
    )
  }

  // GET /core/lead-sources/imports/:importId (admin) — the run + progress.
  getImport (importId, { workspaceId } = {}) {
    return this._call('leadSources.getImport', `/lead-sources/imports/${encodeURIComponent(importId)}${qs({ workspaceId })}`)
  }

  // POST /core/lead-sources/imports/:importId/undo (admin).
  undoImport (importId, { workspaceId } = {}) {
    return this._call(
      'leadSources.undoImport',
      `/lead-sources/imports/${encodeURIComponent(importId)}/undo${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // ── the public web form ───────────────────────────────────────────────

  // POST /core/lead-sources/forms/:key — PUBLIC, no session needed (a
  // visitor on a published site). `fields` is the form's inputs, flat ({
  // name, email, phone, message, … }), plus optional { utm, page: { url,
  // referrer, title }, consent: [{ key, text, accepted, version }],
  // captchaToken } and the honeypot input left EMPTY. → { received: true }.
  submitForm (key, fields = {}) {
    return this._call('leadSources.submitForm', `/lead-sources/forms/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: fields
    })
  }
}

export const createLeadSourceService = config => new LeadSourceService(config)
