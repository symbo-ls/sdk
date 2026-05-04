import { BaseService } from './BaseService.js'

function normalizeKeysParam (keys) {
  if (!keys) { return null }
  if (Array.isArray(keys)) {
    const flattened = keys.flatMap(k => String(k).split(','))
    const cleaned = flattened.map(s => s.trim()).filter(Boolean)
    return cleaned.length ? cleaned.join(',') : null
  }
  const cleaned = String(keys)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return cleaned.length ? cleaned.join(',') : null
}

export class FeatureFlagService extends BaseService {
  // ==================== USER FEATURE FLAGS (optional auth) ====================

  /**
   * Evaluate feature flags for the current user (or anonymous).
   * @param {Object} [params]
   * @param {string[]|string} [params.keys] Optional subset of keys (array or comma-separated string)
   * @returns {Promise<{flags: Record<string, {enabled: boolean, variant: string|null, payload: any}>}>}
   */
  async getFeatureFlags (params = {}) {
    this._requireReady('getFeatureFlags')
    const { keys } = params || {}

    const queryParams = new URLSearchParams()
    const keysParam = normalizeKeysParam(keys)
    if (keysParam) {
      queryParams.append('keys', keysParam)
    }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the drift analyzer matches /feature-flags.
      const response = queryString
        ? await this._request(`/feature-flags?${queryString}`, {
          method: 'GET',
          methodName: 'getFeatureFlags'
        })
        : await this._request('/feature-flags', {
          method: 'GET',
          methodName: 'getFeatureFlags'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get feature flags: ${error.message}`, { cause: error })
    }
  }

  /**
   * Evaluate a single feature flag for the current user (or anonymous).
   */
  async getFeatureFlag (key) {
    this._requireReady('getFeatureFlag')
    if (!key) {
      throw new Error('Feature flag key is required')
    }

    try {
      const response = await this._request(`/feature-flags/${encodeURIComponent(String(key))}`, {
        method: 'GET',
        methodName: 'getFeatureFlag'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get feature flag: ${error.message}`, { cause: error })
    }
  }

  // ==================== ADMIN FEATURE FLAGS (admin only) ====================

  async getAdminFeatureFlags (params = {}) {
    this._requireReady('getAdminFeatureFlags')
    const { includeArchived = true } = params || {}

    const queryParams = new URLSearchParams()
    if (includeArchived === false) {
      queryParams.append('includeArchived', 'false')
    }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the analyzer matches /admin/feature-flags.
      const response = queryString
        ? await this._request(`/admin/feature-flags?${queryString}`, {
          method: 'GET',
          methodName: 'getAdminFeatureFlags'
        })
        : await this._request('/admin/feature-flags', {
          method: 'GET',
          methodName: 'getAdminFeatureFlags'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get admin feature flags: ${error.message}`, {
        cause: error
      })
    }
  }

  async createFeatureFlag (flagData) {
    this._requireReady('createFeatureFlag')
    if (!flagData || typeof flagData !== 'object') {
      throw new Error('Feature flag data is required')
    }
    if (!flagData.key) {
      throw new Error('Feature flag key is required')
    }

    try {
      const response = await this._request('/admin/feature-flags', {
        method: 'POST',
        body: JSON.stringify(flagData),
        methodName: 'createFeatureFlag'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create feature flag: ${error.message}`, { cause: error })
    }
  }

  async updateFeatureFlag (id, patch) {
    this._requireReady('updateFeatureFlag')
    if (!id) {
      throw new Error('Feature flag id is required')
    }
    if (!patch || typeof patch !== 'object') {
      throw new Error('Feature flag patch is required')
    }

    try {
      const response = await this._request(`/admin/feature-flags/${encodeURIComponent(String(id))}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        methodName: 'updateFeatureFlag'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update feature flag: ${error.message}`, { cause: error })
    }
  }

  async archiveFeatureFlag (id) {
    this._requireReady('archiveFeatureFlag')
    if (!id) {
      throw new Error('Feature flag id is required')
    }

    try {
      const response = await this._request(`/admin/feature-flags/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        methodName: 'archiveFeatureFlag'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to archive feature flag: ${error.message}`, { cause: error })
    }
  }
}

