import { BaseService } from './BaseService.js'

export class AdminService extends BaseService {
  // ==================== ADMIN METHODS ====================

  /**
   * Get admin users list with comprehensive filtering and search capabilities
   * Requires admin or super_admin global role
   */
  async getAdminUsers (params = {}) {
    this._requireReady('getAdminUsers')

    const {
      emails,
      ids,
      query,
      status,
      team,
      page = 1,
      limit = 50,
      sort = { field: 'createdAt', order: 'desc' }
    } = params

    const queryParams = new URLSearchParams()

    // Add query parameters
    if (emails) {
      queryParams.append('emails', emails)
    }
    if (ids) {
      queryParams.append('ids', ids)
    }
    if (query) {
      queryParams.append('query', query)
    }
    if (status) {
      queryParams.append('status', status)
    }
    if (page) {
      queryParams.append('page', page.toString())
    }
    if (limit) {
      queryParams.append('limit', limit.toString())
    }
    if (sort && sort.field) {
      queryParams.append('sort[field]', sort.field)
      queryParams.append('sort[order]', sort.order || 'desc')
    }
    if (team != null) {
      queryParams.append('team', team)
    }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the analyzer matches /users/admin/users.
      const response = queryString
        ? await this._request(`/users/admin/users?${queryString}`, {
          method: 'GET',
          methodName: 'getAdminUsers'
        })
        : await this._request('/users/admin/users', {
          method: 'GET',
          methodName: 'getAdminUsers'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get admin users: ${error.message}`, { cause: error })
    }
  }

  /**
   * Assign projects to a specific user
   * Requires admin or super_admin global role
   */
  async assignProjectsToUser (userId, options = {}) {
    this._requireReady('assignProjectsToUser')

    if (!userId) {
      throw new Error('User ID is required')
    }

    const { projectIds, role = 'guest' } = options

    const requestBody = {
      userId,
      role
    }

    // Only include projectIds if provided (otherwise assigns all projects)
    if (projectIds && Array.isArray(projectIds)) {
      requestBody.projectIds = projectIds
    }

    try {
      const response = await this._request('/users/assign-projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        methodName: 'assignProjectsToUser'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to assign projects to user: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update user information (admin only)
   */
  async updateUser (userId, userData) {
    this._requireReady('updateUser')
    if (!userId) {
      throw new Error('User ID is required')
    }
    if (
      !userData ||
      typeof userData !== 'object' ||
      Object.keys(userData).length === 0
    ) {
      throw new Error('userData must be a non-empty object')
    }

    try {
      const response = await this._request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(userData),
        methodName: 'updateUser'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      // Surface duplicate username conflict nicely
      if (error.message?.includes('Duplicate')) {
        throw new Error('Username already exists')
      }
      throw new Error(`Failed to update user: ${error.message}`, { cause: error })
    }
  }

  // ==================== ADMIN HELPER METHODS ====================

  /**
   * Helper method for admin users search
   */
  async searchAdminUsers (searchQuery, options = {}) {
    return await this.getAdminUsers({
      query: searchQuery,
      ...options
    })
  }

  /**
   * Helper method to get admin users by email list
   */
  async getAdminUsersByEmails (emails, options = {}) {
    const emailList = Array.isArray(emails) ? emails.join(',') : emails
    return await this.getAdminUsers({
      emails: emailList,
      ...options
    })
  }

  /**
   * Helper method to get admin users by ID list
   */
  async getAdminUsersByIds (ids, options = {}) {
    const idList = Array.isArray(ids) ? ids.join(',') : ids
    return await this.getAdminUsers({
      ids: idList,
      ...options
    })
  }

  /**
   * Helper method to assign specific projects to a user with a specific role
   */
  async assignSpecificProjectsToUser (userId, projectIds, role = 'guest') {
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      throw new Error('Project IDs must be a non-empty array')
    }

    return await this.assignProjectsToUser(userId, {
      projectIds,
      role
    })
  }

  /**
   * Helper method to assign all projects to a user with a specific role
   */
  async assignAllProjectsToUser (userId, role = 'guest') {
    return await this.assignProjectsToUser(userId, {
      role
    })
  }

  /**
   * Helper method to validate user data for updates
   */
  validateUserData (userData) {
    const errors = []

    if (!userData || typeof userData !== 'object') {
      errors.push('User data must be an object')
      return { isValid: false, errors }
    }

    // Validate email if provided
    if (userData.email && typeof userData.email !== 'string') {
      errors.push('Email must be a string')
    } else if (userData.email && !this._isValidEmail(userData.email)) {
      errors.push('Email must be a valid email address')
    }

    // Validate username if provided
    if (userData.username && typeof userData.username !== 'string') {
      errors.push('Username must be a string')
    } else if (userData.username && userData.username.length < 3) {
      errors.push('Username must be at least 3 characters long')
    }

    // Validate role if provided
    if (userData.role && !['admin', 'user', 'guest'].includes(userData.role)) {
      errors.push('Role must be one of: admin, user, guest')
    }

    // Validate status if provided
    if (userData.status && !['active', 'inactive', 'suspended'].includes(userData.status)) {
      errors.push('Status must be one of: active, inactive, suspended')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Helper method to update user with validation
   */
  async updateUserWithValidation (userId, userData) {
    const validation = this.validateUserData(userData)
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
    }

    return await this.updateUser(userId, userData)
  }

  /**
   * Helper method to get user statistics
   */
  async getUserStats () {
    try {
      const users = await this.getAdminUsers({ limit: 1000 })

      const stats = {
        total: users.length,
        active: 0,
        inactive: 0,
        suspended: 0,
        admins: 0,
        users: 0,
        guests: 0
      }

      users.forEach(user => {
        if (user.status === 'active') {stats.active++}
        if (user.status === 'inactive') {stats.inactive++}
        if (user.status === 'suspended') {stats.suspended++}
        if (user.role === 'admin') {stats.admins++}
        if (user.role === 'user') {stats.users++}
        if (user.role === 'guest') {stats.guests++}
      })

      return stats
    } catch (error) {
      throw new Error(`Failed to get user stats: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to bulk update users
   */
  async bulkUpdateUsers (userUpdates) {
    if (!Array.isArray(userUpdates) || userUpdates.length === 0) {
      throw new Error('User updates must be a non-empty array')
    }

    const updatePromises = userUpdates.map(async update => {
      try {
        const result = await this.updateUser(update.userId, update.userData)
        return {
          userId: update.userId,
          success: true,
          data: result
        }
      } catch (error) {
        return {
          userId: update.userId,
          success: false,
          error: error.message
        }
      }
    })

    const results = await Promise.all(updatePromises)

    return {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  /**
   * Helper method to get users by role
   */
  async getUsersByRole (role, options = {}) {
    const users = await this.getAdminUsers(options)
    return users.filter(user => user.role === role)
  }

  /**
   * Helper method to get users by status
   */
  async getUsersByStatus (status, options = {}) {
    const users = await this.getAdminUsers(options)
    return users.filter(user => user.status === status)
  }

  /**
   * Helper method to activate a user
   */
  async activateUser (userId) {
    return await this.updateUser(userId, { status: 'active' })
  }

  /**
   * Helper method to deactivate a user
   */
  async deactivateUser (userId) {
    return await this.updateUser(userId, { status: 'inactive' })
  }

  /**
   * Helper method to suspend a user
   */
  async suspendUser (userId) {
    return await this.updateUser(userId, { status: 'suspended' })
  }

  /**
   * Helper method to promote user to admin
   */
  async promoteToAdmin (userId) {
    return await this.updateUser(userId, { role: 'admin' })
  }

  /**
   * Helper method to demote user from admin
   */
  async demoteFromAdmin (userId) {
    return await this.updateUser(userId, { role: 'user' })
  }

  /**
   * Get rate-limit stats (admin-only). Exposes the middleware's current
   * per-user/per-IP counters for ops debugging.
   */
  async getRateLimitStats () {
    this._requireReady('getRateLimitStats')
    try {
      const response = await this._request('/users/admin/rate-limit-stats', {
        method: 'GET',
        methodName: 'getRateLimitStats'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get rate limit stats: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get Project.key migration health (admin-only). Surfaces bare vs
   * compound vs suffixed counts, missing-owner-FK count, and any
   * duplicate `(owner, key)` tuples (should be 0 post-§46).
   */
  async getProjectKeyStats () {
    this._requireReady('getProjectKeyStats')
    const response = await this._request('/users/admin/project-key-stats', {
      method: 'GET',
      methodName: 'getProjectKeyStats'
    })
    if (response.success) return response.data
    throw new Error(response.message || 'Failed to get project key stats')
  }

  // ==================== SYSTEM STATUS (/admin/system) ====================

  /**
   * The cross-repo version / CI / release matrix the /admin/system page
   * paints. Mirrors: GET /core/system/status (SystemStatusController.get) —
   * a PUBLIC read the server caches 60 s. Answers the server's object as
   * sent: { matrix, npm, services, packages, warnings, errors, integration }.
   * The shell read it with raw fetch() (workspace shared systemStatus.js);
   * this is the SDK door for it.
   *
   * @param {object} [options]
   * @param {boolean} [options.refresh] - bypass the 60 s server cache (?refresh=1)
   * @param {AbortSignal} [options.signal] - abort the request (e.g. a page timeout)
   * @returns {Promise<object>} the status matrix
   */
  async getSystemStatus ({ refresh = false, signal } = {}) {
    this._requireReady('getSystemStatus')
    // Both paths literal at the _request call site so the drift analyzer
    // matches /system/status (it cannot see through a variable path).
    return refresh
      ? this._request('/system/status?refresh=1', { method: 'GET', methodName: 'getSystemStatus', signal })
      : this._request('/system/status', { method: 'GET', methodName: 'getSystemStatus', signal })
  }

  /**
   * The uptime time series behind the /admin/system day bars. Mirrors:
   * GET /core/system/uptime (SystemUptimeController) — platform superadmin
   * only. Answers { [service]: [{ service, checked_at, status, latency_ms,
   * message }, …] } as sent. The server defaults `limit` to 3000 and caps
   * it at 10000; a missing or non-positive limit sends none.
   *
   * @param {object} [options]
   * @param {number} [options.limit] - most recent rows to read
   * @param {AbortSignal} [options.signal] - abort the request
   * @returns {Promise<object>} rows grouped by service
   */
  async getSystemUptime ({ limit, signal } = {}) {
    this._requireReady('getSystemUptime')
    const n = Math.floor(Number(limit))
    return Number.isFinite(n) && n > 0
      ? this._request(`/system/uptime?limit=${n}`, { method: 'GET', methodName: 'getSystemUptime', signal })
      : this._request('/system/uptime', { method: 'GET', methodName: 'getSystemUptime', signal })
  }

  /**
   * @typedef {object} AdminSubscriberRow
   * @property {string} id - subscription id
   * @property {'active'|'trialing'|'past_due'|'canceled'|'trial_expired'} status
   * @property {'ended'|'simulation'|'stripe'|'grant'|'comp'|'manual'|'legacy'|'unpriced'} class -
   *   the server's recurring-revenue class; only 'stripe' and 'manual' are revenue
   * @property {number|null} monthly - minor units per month (billable classes only, else null)
   * @property {string} currency - upper-case ISO-4217
   * @property {boolean} hasStripe - true when a Stripe subscription backs the row (the id is never sent)
   * @property {'project'|'workspace'|'organization'|null} billingScope
   * @property {{ id: string, name: string|null, displayName: string|null, tier: string|null }|null} plan
   * @property {{ id: string, name: string|null, slug: string|null }|null} organization
   * @property {{ id: string, displayName: string|null, slug: string|null, key: string|null }|null} workspace
   * @property {{ id: string, name: string|null, key: string|null }|null} project
   * @property {string|null} selectedPricingKey
   * @property {{ amount: number|null, currency: string, interval: string|null, displayName: string|null, lookupKey: string|null }|null} pricingSnapshot
   * @property {string|null} currentPeriodStart - ISO date
   * @property {string|null} currentPeriodEnd - ISO date
   * @property {boolean} cancelAtPeriodEnd
   * @property {string|null} createdAt - ISO date
   */

  /**
   * @typedef {object} AdminSubscribersSummary
   * @property {number} total - rows matching the filter (all pages)
   * @property {Object<string, { mrr: number, arr: number, billable: number, atRisk: { mrr: number, count: number } }>} currencies -
   *   per currency, never mixed; mrr/arr in minor units over 'stripe' + 'manual'
   *   rows in active/trialing; past_due rows sit in atRisk, outside mrr
   * @property {Object<string, number>} byClass - row count per class
   * @property {Object<string, number>} byStatus - row count per status
   * @property {number} unpricedBillable - billable rows with no computable monthly amount
   * @property {number} renewalsDue30d - live billable rows renewing within 30 days
   * @property {number} cancelAtPeriodEnd - live rows set to cancel at period end
   * @property {string} asOf - ISO timestamp of the computation
   */

  /**
   * The platform's subscriber ledger + recurring-revenue summary — the
   * system/company Subscriptions console. Mirrors: GET /core/admin/subscribers
   * (AdminSubscribersController.list) — platform SUPERUSER only, and only
   * from an interactive session (a CLI / plugin / OAuth / workspace token
   * gets 403 interactive_session_required).
   *
   * The summary covers every row matching `status`, not just the page.
   * Rows never carry emails, payment method, billing address, user data or
   * any Stripe id (`hasStripe` is a boolean).
   *
   * @param {object} [options]
   * @param {string|string[]} [options.status] - statuses to list: any of
   *   active, trialing, past_due, canceled, trial_expired, or 'all'.
   *   Default (none sent): active + trialing + past_due.
   * @param {number} [options.limit] - page size; the server defaults to 50 and caps at 100
   * @param {number} [options.offset] - rows to skip
   * @param {AbortSignal} [options.signal] - abort the request
   * @returns {Promise<{ rows: AdminSubscriberRow[], summary: AdminSubscribersSummary, paging: { limit: number, offset: number, total: number } }>}
   */
  async getAdminSubscribers ({ status, limit, offset, signal } = {}) {
    this._requireReady('getAdminSubscribers')
    const qs = new URLSearchParams()
    const statuses = (Array.isArray(status) ? status : [status])
      .filter(s => typeof s === 'string' && s.trim())
      .map(s => s.trim())
    if (statuses.length) qs.append('status', statuses.join(','))
    const n = Math.floor(Number(limit))
    if (Number.isFinite(n) && n > 0) qs.append('limit', String(n))
    const o = Math.floor(Number(offset))
    if (Number.isFinite(o) && o > 0) qs.append('offset', String(o))
    const query = qs.toString()
    // Both paths literal at the _request call site so the drift analyzer
    // matches /admin/subscribers (it drops a `qs` query hole).
    const response = query
      ? await this._request(`/admin/subscribers?${qs.toString()}`, { method: 'GET', methodName: 'getAdminSubscribers', signal })
      : await this._request('/admin/subscribers', { method: 'GET', methodName: 'getAdminSubscribers', signal })
    if (response && typeof response === 'object' && 'success' in response) {
      if (response.success) return response.data
      throw new Error(response.message || 'getAdminSubscribers failed')
    }
    return response
  }

  /**
   * Private helper to validate email format
   */
  _isValidEmail (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
    return emailRegex.test(email)
  }
}
