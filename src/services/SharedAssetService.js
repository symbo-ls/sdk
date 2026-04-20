import { BaseService } from './BaseService.js'

/**
 * Shared assets are cross-project resources (components, icons, templates,
 * etc.) that can be referenced by multiple projects. Listing and fetching are
 * public-ish (optionalAuth on the server), while create/update/delete require
 * authentication.
 */
export class SharedAssetService extends BaseService {
  // ==================== SHARED ASSETS ====================

  async createAsset (body) {
    this._requireReady('createAsset')
    if (!body || typeof body !== 'object') {
      throw new Error('Asset body is required')
    }

    const response = await this._request('/shared-assets', {
      method: 'POST',
      body: JSON.stringify(body),
      methodName: 'createAsset'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async listAssets (query = {}) {
    this._requireReady('listAssets')

    const queryParams = new URLSearchParams()
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') queryParams.append(k, String(v))
    }
    const queryString = queryParams.toString()
    const url = `/shared-assets${queryString ? `?${queryString}` : ''}`

    const response = await this._request(url, {
      method: 'GET',
      methodName: 'listAssets'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getAsset (id) {
    this._requireReady('getAsset')
    if (!id) throw new Error('id is required')

    const response = await this._request(`/shared-assets/${id}`, {
      method: 'GET',
      methodName: 'getAsset'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateAsset (id, patch) {
    this._requireReady('updateAsset')
    if (!id) throw new Error('id is required')

    const response = await this._request(`/shared-assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch || {}),
      methodName: 'updateAsset'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async deleteAsset (id) {
    this._requireReady('deleteAsset')
    if (!id) throw new Error('id is required')

    const response = await this._request(`/shared-assets/${id}`, {
      method: 'DELETE',
      methodName: 'deleteAsset'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }
}
