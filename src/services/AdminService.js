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
    const url = `/users/admin/users${queryString ? `?${queryString}` : ''}`

    try {
      const response = await this._request(url, {
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
   * Private helper to validate email format
   */
  _isValidEmail (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
    return emailRegex.test(email)
  }
}
