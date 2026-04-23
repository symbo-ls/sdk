import { BaseService } from './BaseService.js'

export class MetricsService extends BaseService {
  // ==================== METRICS METHODS ====================

  /**
   * Contribution heat-map stats.
   *
   * Mirrors: GET /metrics/contributions (MetricsController.getContributions)
   */
  async getContributions (options = {}) {
    this._requireReady('getContributions')

    const { projectId, userId, from, to } = options || {}
    const queryParams = new URLSearchParams()

    if (projectId != null) { queryParams.append('projectId', String(projectId)) }
    if (userId != null) { queryParams.append('userId', String(userId)) }
    if (from != null) { queryParams.append('from', String(from)) }
    if (to != null) { queryParams.append('to', String(to)) }

    const queryString = queryParams.toString()

    try {
      // Inline both branches at the _request call site so the drift
      // analyzer matches /metrics/contributions (it can't see through
      // `_request(url, …)` when `url` is a variable).
      const response = queryString
        ? await this._request(`/metrics/contributions?${queryString}`, {
          method: 'GET',
          methodName: 'getContributions'
        })
        : await this._request('/metrics/contributions', {
          method: 'GET',
          methodName: 'getContributions'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get contribution stats: ${error.message}`, { cause: error })
    }
  }

  /**
   * Current billing-cycle usage summary for a project. Server routes
   * through the subscription cascade — Enterprise projects resolve
   * to the org's HQ subscription; workspace-scoped projects resolve
   * to their workspace subscription.
   *
   * Mirrors: GET /usage/project/:projectId (UsageController.summary)
   *
   * @param {string} projectId
   * @returns {Promise<object>} - { creditsUsed, creditsLimit, period, breakdown? }
   */
  async getProjectUsage (projectId) {
    this._requireReady('getProjectUsage')
    if (!projectId) throw new Error('projectId is required')
    const response = await this._request(`/usage/project/${projectId}`, {
      method: 'GET',
      methodName: 'getProjectUsage'
    })
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to get project usage')
  }
}

// End
