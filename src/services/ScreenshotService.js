import { BaseService } from './BaseService.js'

export class ScreenshotService extends BaseService {
  constructor (config) {
    super(config)
    this._debounceTimers = new Map()
    this._inflightRefreshes = new Map()
  }

  // ==================== PROJECT-LEVEL OPERATIONS ====================

  async createScreenshotProject (payload) {
    this._requireReady('createScreenshotProject')
    try {
      const response = await this._request('/screenshots/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
        methodName: 'createScreenshotProject'
      })
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create screenshot project: ${error.message}`, { cause: error })
    }
  }

  async getProjectScreenshots (projectKey, params = {}) {
    this._requireReady('getProjectScreenshots')
    if (!projectKey) {throw new Error('projectKey is required')}
    const { type = 'all', status, limit = 50, offset = 0 } = params
    const qs = new URLSearchParams()
    if (type) {qs.set('type', type)}
    if (status) {qs.set('status', status)}
    if (limit != null) {qs.set('limit', String(limit))}
    if (offset != null) {qs.set('offset', String(offset))}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}${qs.toString() ? `?${qs.toString()}` : ''}`,
        { method: 'GET', methodName: 'getProjectScreenshots' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project screenshots: ${error.message}`, { cause: error })
    }
  }

  async reprocessProjectScreenshots (projectKey, body = {}) {
    this._requireReady('reprocessProjectScreenshots')
    if (!projectKey) {throw new Error('projectKey is required')}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}/reprocess`,
        { method: 'POST', body: JSON.stringify(body), methodName: 'reprocessProjectScreenshots' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to reprocess screenshots: ${error.message}`, { cause: error })
    }
  }

  /**
   * Recreate screenshots for a project. Smart delta by default; pass
   * `force: true` to re-render everything. Server-side this enqueues via
   * BullMQ so the call returns as soon as jobs are queued.
   *
   * Body fields:
   *   - `environment`: 'development' | 'staging' | 'production' (default production).
   *     Screenshots are captured per-environment — dev/staging/prod don't
   *     overwrite each other. Only `production` updates `project.thumbnail`.
   *   - `process_pages` / `process_components` / `process_descriptions`: booleans
   *   - `force`: boolean — bypass the delta check
   *   - `priority`: number (default 5)
   *   - `only_one` + `page_path` | `page_key` | `component_key` | `screenshot_id`: target a single shot
   *   - `prefer`: 'auto' | 'page' | 'component'
   *
   * Note: normal editor saves + publishes already auto-trigger a 15-min
   * debounced refresh via the server's `scheduleDebouncedRefresh` hook
   * (dev on save, stag/prod on publish). Only call this directly when you
   * need an immediate capture or a force-all refresh.
   */
  async recreateProjectScreenshots (projectKey, body = {}) {
    this._requireReady('recreateProjectScreenshots')
    if (!projectKey) {throw new Error('projectKey is required')}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}/recreate`,
        { method: 'POST', body: JSON.stringify(body), methodName: 'recreateProjectScreenshots' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to recreate screenshots: ${error.message}`, { cause: error })
    }
  }

  /**
   * Convenience wrapper: force-refresh screenshots for a specific
   * environment. Equivalent to `recreateProjectScreenshots(projectKey,
   * { environment, force: true })`.
   */
  async refreshForEnvironment (projectKey, environment = 'production', extra = {}) {
    if (!['development', 'staging', 'production'].includes(environment)) {
      throw new Error(`environment must be development | staging | production, got ${environment}`)
    }
    return this.recreateProjectScreenshots(projectKey, { environment, force: true, ...extra })
  }

  async deleteProjectScreenshots (projectKey) {
    this._requireReady('deleteProjectScreenshots')
    if (!projectKey) {throw new Error('projectKey is required')}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}`,
        { method: 'DELETE', methodName: 'deleteProjectScreenshots' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete project screenshots: ${error.message}`, { cause: error })
    }
  }

  // ==================== THUMBNAIL ====================

  async getThumbnailCandidate (projectKey, options = {}) {
    this._requireReady('getThumbnailCandidate')
    if (!projectKey) {throw new Error('projectKey is required')}
    const { includeData = false } = options
    const qs = new URLSearchParams()
    if (includeData) {qs.set('include_data', 'true')}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}/thumbnail/candidate${qs.toString() ? `?${qs.toString()}` : ''}`,
        { method: 'GET', methodName: 'getThumbnailCandidate' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get thumbnail candidate: ${error.message}`, { cause: error })
    }
  }

  async updateProjectThumbnail (projectKey, body = {}) {
    this._requireReady('updateProjectThumbnail')
    if (!projectKey) {throw new Error('projectKey is required')}
    try {
      const response = await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}/thumbnail`,
        { method: 'POST', body: JSON.stringify(body), methodName: 'updateProjectThumbnail' }
      )
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project thumbnail: ${error.message}`, { cause: error })
    }
  }

  // ==================== INDIVIDUAL SHOTS ====================

  async getPageScreenshot (screenshotId, format = 'json') {
    this._requireReady('getPageScreenshot')
    if (!screenshotId) {throw new Error('screenshotId is required')}
    const qs = new URLSearchParams()
    if (format) {qs.set('format', format)}
    try {
      return await this._request(
        `/screenshots/pages/${encodeURIComponent(screenshotId)}${qs.toString() ? `?${qs.toString()}` : ''}`,
        { method: 'GET', methodName: 'getPageScreenshot' }
      )
    } catch (error) {
      throw new Error(`Failed to get page screenshot: ${error.message}`, { cause: error })
    }
  }

  async getComponentScreenshot (screenshotId, format = 'json') {
    this._requireReady('getComponentScreenshot')
    if (!screenshotId) {throw new Error('screenshotId is required')}
    const qs = new URLSearchParams()
    if (format) {qs.set('format', format)}
    try {
      return await this._request(
        `/screenshots/components/${encodeURIComponent(screenshotId)}${qs.toString() ? `?${qs.toString()}` : ''}`,
        { method: 'GET', methodName: 'getComponentScreenshot' }
      )
    } catch (error) {
      throw new Error(`Failed to get component screenshot: ${error.message}`, { cause: error })
    }
  }

  async getScreenshotByKey (projectKey, type, key, format = 'json') {
    this._requireReady('getScreenshotByKey')
    if (!projectKey) {throw new Error('projectKey is required')}
    if (!type || !['component', 'page'].includes(String(type))) {
      throw new Error("type must be 'component' or 'page'")
    }
    if (!key) {throw new Error('key is required')}
    const qs = new URLSearchParams()
    if (format) {qs.set('format', format)}
    const sub = type === 'component' ? 'components' : 'pages'
    try {
      return await this._request(
        `/screenshots/projects/${encodeURIComponent(projectKey)}/${sub}/${encodeURIComponent(key)}${qs.toString() ? `?${qs.toString()}` : ''}`,
        { method: 'GET', methodName: 'getScreenshotByKey' }
      )
    } catch (error) {
      throw new Error(`Failed to get screenshot by key: ${error.message}`, { cause: error })
    }
  }

  async getQueueStatistics () {
    this._requireReady('getQueueStatistics')
    try {
      const response = await this._request('/screenshots/queue/stats', {
        method: 'GET',
        methodName: 'getQueueStatistics'
      })
      if (response.success) {return response}
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get queue statistics: ${error.message}`, { cause: error })
    }
  }

  // ==================== COMBINATION/DEBOUNCED ====================

  /**
   * Debounced thumbnail refresh that recreates screenshots and then updates thumbnail.
   * Subsequent calls within debounce window reset the timer.
   */
  async refreshThumbnail (projectKey, options = {}) {
    this._requireReady('refreshThumbnail')
    if (!projectKey) {throw new Error('projectKey is required')}

    const {
      debounceMs = 15000,
      waitAfterRecreateMs = 20000,
      recreate = {
        process_pages: true,
        process_components: false,
        process_descriptions: false,
        force: false,
        priority: 5
      },
      thumbnail = {
        strategy: 'auto',
        force: true
      }
    } = options

    // Clear existing debounce timer if present
    const existingTimer = this._debounceTimers.get(projectKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Wrap execution in a promise we store, so callers can await the outcome
    const executionPromise = await new Promise(resolve => {
      const timer = setTimeout(async () => {
        try {
          // Step 1: queue screenshot recreation (non-blocking server-side)
          await this.recreateProjectScreenshots(projectKey, recreate)

          // Step 2: wait for some time to allow processing to progress
          await new Promise(resolveDelay => { setTimeout(resolveDelay, waitAfterRecreateMs) })

          // Step 3: update thumbnail using best candidate
          const result = await this.updateProjectThumbnail(projectKey, thumbnail)
          resolve(result)
        } catch (e) {
          // Resolve with error object but do not throw to avoid unhandled rejections
          resolve({ success: false, error: e?.message || String(e) })
        } finally {
          this._debounceTimers.delete(projectKey)
          this._inflightRefreshes.delete(projectKey)
        }
      }, debounceMs)

      this._debounceTimers.set(projectKey, timer)
    })

    this._inflightRefreshes.set(projectKey, executionPromise)
    return executionPromise
  }
}

export default ScreenshotService


