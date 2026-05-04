import { BaseService } from './BaseService.js'

export class WaitlistService extends BaseService {
  // ==================== WAITLIST METHODS ====================

  /**
   * Join a waitlist campaign (public).
   *
   * Mirrors: POST /waitlist (WaitlistController.join)
   */
  async joinWaitlist (data = {}) {
    this._requireReady('joinWaitlist')
    if (!data || typeof data !== 'object') {
      throw new Error('Waitlist join payload is required')
    }
    if (!data.email) {
      throw new Error('Email is required')
    }

    try {
      const response = await this._request('/waitlist', {
        method: 'POST',
        body: JSON.stringify(data),
        methodName: 'joinWaitlist'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to join waitlist: ${error.message}`, { cause: error })
    }
  }

  /**
   * List waitlist entries (admin).
   *
   * Mirrors: GET /waitlist (WaitlistController.list)
   */
  async listWaitlistEntries (options = {}) {
    this._requireReady('listWaitlistEntries')

    const {
      campaignKey,
      status,
      search,
      page,
      limit
    } = options || {}

    const queryParams = new URLSearchParams()
    if (campaignKey != null) { queryParams.append('campaignKey', String(campaignKey)) }
    if (status != null) { queryParams.append('status', String(status)) }
    if (search != null) { queryParams.append('search', String(search)) }
    if (page != null) { queryParams.append('page', String(page)) }
    if (limit != null) { queryParams.append('limit', String(limit)) }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the analyzer matches /waitlist.
      const response = queryString
        ? await this._request(`/waitlist?${queryString}`, {
          method: 'GET',
          methodName: 'listWaitlistEntries'
        })
        : await this._request('/waitlist', {
          method: 'GET',
          methodName: 'listWaitlistEntries'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list waitlist entries: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update a waitlist entry (admin).
   *
   * Mirrors: PATCH /waitlist/:id (WaitlistController.update)
   */
  async updateWaitlistEntry (id, update = {}) {
    this._requireReady('updateWaitlistEntry')
    if (!id) {
      throw new Error('Waitlist entry ID is required')
    }
    if (!update || typeof update !== 'object') {
      throw new Error('Update payload is required')
    }

    try {
      const response = await this._request(`/waitlist/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
        methodName: 'updateWaitlistEntry'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update waitlist entry: ${error.message}`, { cause: error })
    }
  }

  /**
   * Send an invitation email for a waitlist entry (admin).
   *
   * Mirrors: POST /waitlist/:id/invite (WaitlistController.invite)
   */
  async inviteWaitlistEntry (id) {
    this._requireReady('inviteWaitlistEntry')
    if (!id) {
      throw new Error('Waitlist entry ID is required')
    }

    try {
      const response = await this._request(`/waitlist/${id}/invite`, {
        method: 'POST',
        methodName: 'inviteWaitlistEntry'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to invite waitlist entry: ${error.message}`, { cause: error })
    }
  }
}

// End
