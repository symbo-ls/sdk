import { BaseService } from './BaseService.js'

// FleetService wraps the MAIN SERVER /fleet/* routes (Mongo-backed,
// CORE-FLEET-COLLECTIONS-API-1): the fleet's first-class, workspace-scoped
// collections — runs (priced worker runs), metrics (dispatch/complete/box
// samples), events (fleetd audit + pm-events) and per-node config (the
// CONFIG-<NODE> knobs). Rows are APPEND-ONLY and idempotent on `key`; config
// is merged on PUT with an optional compare-and-set (`ifVersion`).
//
// Every call goes through _call() to ${apiUrl}/core/fleet/*. The active
// workspace is attached automatically (query for reads, body for writes)
// unless the caller names one — the fleet's own workspace is nikoloza/fleet.
export class FleetService extends BaseService {
  /**
   * Active-workspace scope — the same defaulter TicketService uses: live SDK
   * context first, then the persisted `activeWorkspace` storage key.
   * @returns {string|null|undefined}
   */
  _workspaceScope () {
    return this._resolveWorkspaceId(undefined, { fallbackToStorage: true })
  }

  _scoped (params = {}) {
    const wid = (params.workspaceId || params.workspace || params.workspace_id)
      ? null
      : this._workspaceScope()
    return wid ? { ...params, workspaceId: wid } : params
  }

  // Query string for a read: every defined param, Dates as ISO, scope attached.
  _query (params = {}) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(this._scoped(params))) {
      if (v === undefined || v === null || v === '') continue
      qs.set(k, v instanceof Date ? v.toISOString() : String(v))
    }
    const s = qs.toString()
    return s ? `?${s}` : ''
  }

  _rows (rows) {
    return Array.isArray(rows) ? rows : [rows]
  }

  // Read every page by following the server's `nextCursor`, and say so when
  // it could not finish — the same honesty rule as tickets.listAll().
  async _drain (listPage, params = {}, { pageSize = 500, maxPages = 100 } = {}) {
    const limit = Math.max(1, Math.min(Number(pageSize) || 500, 500))
    const items = []
    let cursor = params.cursor || undefined
    let pages = 0
    for (; pages < maxPages; pages++) {
      const page = await listPage({ ...params, limit, cursor })
      const batch = (page && page.data) || []
      items.push(...batch)
      const paging = (page && page.paging) || {}
      if (!paging.hasMore || !paging.nextCursor) return { items, complete: true, pages: pages + 1 }
      cursor = paging.nextCursor
      if (!batch.length) break
    }
    return {
      items,
      complete: false,
      pages,
      incomplete: `read ${items.length} row(s) in ${pages} page(s) without reaching the end`
    }
  }

  // ==================== RUNS ====================

  /**
   * One page of priced worker runs, newest first by default.
   *
   * @param {object} params - since, until (ISO or epoch ms), limit (≤500),
   *   order ('asc'|'desc'), cursor, node, lane, ticket, model, result, account,
   *   workspaceId (defaults to the active workspace)
   * @returns {Promise<{data: object[], paging: object}>}
   */
  listRuns (params = {}) {
    const qs = this._query(params)
    return this._call('fleet.listRuns', `/fleet/runs${qs}`, { raw: true })
  }

  /** Every run matching `params`, following the cursor to the end. */
  listAllRuns (params = {}, paging = {}) {
    return this._drain((p) => this.listRuns(p), params, paging)
  }

  /**
   * Append run rows (one row or an array, ≤500). The run-ledger's snake_case
   * shape is accepted as-is (`at`, `wall_ms`, `cost_usd`, `is_error`, …).
   * A row whose `key` already exists is skipped and named in `duplicateKeys`.
   *
   * @returns {Promise<{data: object[], inserted: number, duplicates: number, duplicateKeys: string[]}>}
   */
  appendRuns (rows) {
    return this._call('fleet.appendRuns', '/fleet/runs', {
      method: 'POST',
      body: this._scoped({ rows: this._rows(rows) }),
      raw: true
    })
  }

  // ==================== METRICS ====================

  /**
   * One page of metric samples. Same paging as listRuns; filters: node, kind,
   * lane, ticket, model.
   */
  listMetrics (params = {}) {
    const qs = this._query(params)
    return this._call('fleet.listMetrics', `/fleet/metrics${qs}`, { raw: true })
  }

  listAllMetrics (params = {}, paging = {}) {
    return this._drain((p) => this.listMetrics(p), params, paging)
  }

  /**
   * Append metric rows. metrics.jsonl's shape is accepted as-is (`ev` → kind,
   * `t` → ts, every other column → payload).
   */
  appendMetrics (rows) {
    return this._call('fleet.appendMetrics', '/fleet/metrics', {
      method: 'POST',
      body: this._scoped({ rows: this._rows(rows) }),
      raw: true
    })
  }

  // ==================== EVENTS ====================

  /**
   * One page of fleet events. Same paging as listRuns; filters: node, kind,
   * lane, ticket, actor.
   */
  listEvents (params = {}) {
    const qs = this._query(params)
    return this._call('fleet.listEvents', `/fleet/events${qs}`, { raw: true })
  }

  listAllEvents (params = {}, paging = {}) {
    return this._drain((p) => this.listEvents(p), params, paging)
  }

  /** Append event rows: { kind, node, ts?, ticket?, lane?, actor?, message?, key?, …payload }. */
  appendEvents (rows) {
    return this._call('fleet.appendEvents', '/fleet/events', {
      method: 'POST',
      body: this._scoped({ rows: this._rows(rows) }),
      raw: true
    })
  }

  // ==================== CONFIG ====================

  /** Every node's knobs in the workspace. */
  listConfig (params = {}) {
    const qs = this._query(params)
    return this._call('fleet.listConfig', `/fleet/config${qs}`)
  }

  /** One node's knobs — rejects with a 404 (`config_not_found`) before the first setConfig. */
  getConfig (node, params = {}) {
    const qs = this._query(params)
    return this._call(
      'fleet.getConfig',
      `/fleet/config/${encodeURIComponent(node)}${qs}`
    )
  }

  /**
   * Merge knobs into a node's config: { paceDial (0-16), hygieneApply,
   * watcherSource ('platform'|'md'), holdEpics ([] or a comma list) }. Pass
   * `ifVersion` to compare-and-set (412 `version_mismatch` when stale).
   *
   * @returns {Promise<{data: object, created: boolean}>}
   */
  setConfig (node, knobs = {}, { ifVersion, workspaceId } = {}) {
    const body = { ...knobs }
    if (ifVersion !== undefined && ifVersion !== null) body.ifVersion = ifVersion
    if (workspaceId) body.workspaceId = workspaceId
    return this._call('fleet.setConfig', `/fleet/config/${encodeURIComponent(node)}`, {
      method: 'PUT',
      body: this._scoped(body),
      raw: true
    })
  }
}
