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
    const url = `/metrics/contributions${queryString ? `?${queryString}` : ''}`

    try {
      const response = await this._request(url, {
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
}

// End
