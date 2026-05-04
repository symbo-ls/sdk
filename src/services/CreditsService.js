import { BaseService } from './BaseService.js'

/**
 * Project-scoped credit balance, ledger, spend-controls, and top-up.
 * Companion to the workspace-scoped credit methods on WorkspaceService.
 * Public rate card (`getRates`) is unauthenticated — used by the pricing
 * page and checkout flows to render model multipliers + infra rates
 * without a session round-trip.
 */
export class CreditsService extends BaseService {
  /**
   * Public credit rate card. No auth required. Mirrors what the server
   * bills internally: retail USD per credit, topup pack size, tier
   * definitions, model multipliers, infra / comms / governance rates.
   * @returns {Promise<object>}
   */
  async getRates () {
    return this._call('getRates', '/credits/rates')
  }

  /**
   * Current credit balance for a project. Includes tier + plan
   * metadata the server folds in from the workspace subscription.
   * Editor / admin / owner only on the server.
   * @param {string} projectId
   * @returns {Promise<{available: number, reserved?: number, tier: string, ...}>}
   */
  async getProjectBalance (projectId) {
    if (!projectId) throw new Error('projectId is required')
    return this._call('getProjectBalance', `/projects/${projectId}/credits/balance`)
  }

  /**
   * Paginated credit ledger for a project. Use `cursor` (the last
   * ledger row's `_id`) to fetch the next page; `limit` caps at 500
   * server-side. Admin / owner only.
   * @param {string} projectId
   * @param {{limit?: number, cursor?: string, reason?: string}} [options]
   * @returns {Promise<{items: Array<object>, nextCursor?: string}>}
   */
  async getProjectLedger (projectId, { limit, cursor, reason } = {}) {
    this._requireReady('getProjectLedger')
    if (!projectId) throw new Error('projectId is required')
    const qs = new URLSearchParams()
    if (limit != null) qs.append('limit', String(limit))
    if (cursor) qs.append('cursor', cursor)
    if (reason) qs.append('reason', reason)
    const queryString = qs.toString()
    const response = queryString
      ? await this._request(`/projects/${projectId}/credits/ledger?${queryString}`, {
        method: 'GET',
        methodName: 'getProjectLedger'
      })
      : await this._request(`/projects/${projectId}/credits/ledger`, {
        method: 'GET',
        methodName: 'getProjectLedger'
      })
    if (response?.success) return response.data
    return { items: [] }
  }

  /**
   * Read a project's spend-control config. Returns null if none set.
   * Admin / owner only.
   * @param {string} projectId
   * @returns {Promise<object | null>}
   */
  async getProjectSpendControls (projectId) {
    if (!projectId) throw new Error('projectId is required')
    return this._call('getProjectSpendControls', `/projects/${projectId}/credits/controls`)
  }

  /**
   * Upsert a project's spend-control config. Pass only the fields that
   * should change — undefined fields are preserved server-side. Admin /
   * owner only.
   * @param {string} projectId
   * @param {{hardCap?: number, categoryCaps?: object, alerts?: object, autoRecharge?: object}} controls
   * @returns {Promise<object>}
   */
  async updateProjectSpendControls (projectId, controls = {}) {
    if (!projectId) throw new Error('projectId is required')
    return this._call(
      'updateProjectSpendControls',
      `/projects/${projectId}/credits/controls`,
      { method: 'PUT', body: controls }
    )
  }

  /**
   * Top up a project's credit balance via a Stripe checkout session.
   * Returns the checkout URL for the caller to redirect to. Admin /
   * owner only.
   * @param {string} projectId
   * @param {{packs?: number, returnUrl?: string}} [args] - packs defaults to 1
   * @returns {Promise<{checkoutUrl: string, sessionId: string}>}
   */
  async topupProjectCredits (projectId, { packs = 1, returnUrl } = {}) {
    if (!projectId) throw new Error('projectId is required')
    return this._call(
      'topupProjectCredits',
      `/projects/${projectId}/credits/topup`,
      { method: 'POST', body: { packs, ...(returnUrl ? { returnUrl } : {}) } }
    )
  }
}
