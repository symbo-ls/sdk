import { BaseService } from './BaseService.js'

export class SubscriptionService extends BaseService {
  // ==================== SUBSCRIPTION METHODS ====================

  /**
   * Create a new subscription checkout session
   */
  async createSubscription (subscriptionData) {
    this._requireReady('createSubscription')
    if (!subscriptionData || typeof subscriptionData !== 'object') {
      throw new Error('Subscription data is required')
    }

    const { projectId, planId, pricingKey = 'monthly', seats = 1, successUrl, cancelUrl } = subscriptionData

    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!planId) {
      throw new Error('Plan ID is required')
    }

    try {
      const response = await this._request('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          planId,
          pricingKey,
          seats,
          successUrl,
          cancelUrl
        }),
        methodName: 'createSubscription'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create subscription: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get subscription status and usage for a project
   */
  async getProjectStatus (projectId) {
    this._requireReady('getProjectStatus')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    try {
      const response = await this._request(`/subscriptions/project/${projectId}`, {
        method: 'GET',
        methodName: 'getProjectStatus'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project subscription status: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get usage data for a subscription
   */
  async getUsage (subscriptionId) {
    this._requireReady('getUsage')
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    try {
      const response = await this._request(`/subscriptions/${subscriptionId}/usage`, {
        method: 'GET',
        methodName: 'getUsage'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get subscription usage: ${error.message}`, { cause: error })
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription (subscriptionId) {
    this._requireReady('cancelSubscription')
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    try {
      const response = await this._request(`/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        methodName: 'cancelSubscription'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to cancel subscription: ${error.message}`, { cause: error })
    }
  }

  /**
   * List invoices for a subscription
   */
  async listInvoices (subscriptionId, options = {}) {
    this._requireReady('listInvoices')
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    const { page = 1, limit = 20, status, startingAfter } = options

    try {
      const queryParams = new URLSearchParams()
      if (page) {queryParams.append('page', page.toString())}
      if (limit) {queryParams.append('limit', limit.toString())}
      if (status) {queryParams.append('status', status)}
      if (startingAfter) {queryParams.append('startingAfter', startingAfter)}

      const queryString = queryParams.toString()
      const url = `/subscriptions/${subscriptionId}/invoices${queryString ? `?${queryString}` : ''}`

      const response = await this._request(url, {
        method: 'GET',
        methodName: 'listInvoices'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list invoices: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get customer portal URL for a subscription
   */
  async getPortalUrl (subscriptionId, returnUrl) {
    this._requireReady('getPortalUrl')
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    try {
      const queryParams = new URLSearchParams()
      if (returnUrl) {queryParams.append('returnUrl', returnUrl)}

      const queryString = queryParams.toString()
      const url = `/subscriptions/${subscriptionId}/portal${queryString ? `?${queryString}` : ''}`

      const response = await this._request(url, {
        method: 'GET',
        methodName: 'getPortalUrl'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get portal URL: ${error.message}`, { cause: error })
    }
  }

  // ==================== SUBSCRIPTION HELPER METHODS ====================

  /**
   * Helper method to create subscription with validation
   */
  async createSubscriptionWithValidation (subscriptionData) {
    if (!subscriptionData || typeof subscriptionData !== 'object') {
      throw new Error('Subscription data must be a valid object')
    }

    // Basic validation for required fields
    const requiredFields = ['projectId', 'planId']
    for (const field of requiredFields) {
      if (!subscriptionData[field]) {
        throw new Error(`Required field '${field}' is missing`)
      }
    }

    // Validate seats is a positive integer
    if (subscriptionData.seats != null) {
      if (!Number.isInteger(subscriptionData.seats) || subscriptionData.seats < 1) {
        throw new Error('Seats must be a positive integer')
      }
    }

    // Validate pricingKey
    if (subscriptionData.pricingKey && !['monthly', 'yearly'].includes(subscriptionData.pricingKey)) {
      throw new Error('Pricing key must be either "monthly" or "yearly"')
    }

    return await this.createSubscription(subscriptionData)
  }

  /**
   * Helper method to check if project has active subscription
   */
  async hasActiveSubscription (projectId) {
    try {
      const status = await this.getProjectStatus(projectId)
      return status.hasSubscription === true
    } catch (error) {
      throw new Error(`Failed to check subscription status: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to get subscription details for a project
   */
  async getProjectSubscription (projectId) {
    try {
      const status = await this.getProjectStatus(projectId)
      if (!status.hasSubscription) {
        return null
      }
      return status.subscription
    } catch (error) {
      throw new Error(`Failed to get project subscription: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to get usage with limits for a project
   */
  async getProjectUsage (projectId) {
    try {
      const status = await this.getProjectStatus(projectId)
      if (!status.hasSubscription) {
        return null
      }
      return status.usage
    } catch (error) {
      throw new Error(`Failed to get project usage: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to get invoices with pagination
   */
  async getInvoicesWithPagination (subscriptionId, options = {}) {
    try {
      const result = await this.listInvoices(subscriptionId, options)
      return {
        invoices: result.data || [],
        pagination: result.pagination || {}
      }
    } catch (error) {
      throw new Error(`Failed to get invoices with pagination: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to check if subscription is active
   */
  async isSubscriptionActive (subscriptionId) {
    try {
      const usage = await this.getUsage(subscriptionId)
      // This would depend on the actual response structure
      // You might need to adjust based on your backend response
      return usage && usage.subscription && usage.subscription.status === 'active'
    } catch (error) {
      throw new Error(`Failed to check subscription status: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to get subscription limits
   */
  async getSubscriptionLimits (subscriptionId) {
    try {
      const usage = await this.getUsage(subscriptionId)
      return usage.limits || {}
    } catch (error) {
      throw new Error(`Failed to get subscription limits: ${error.message}`, { cause: error })
    }
  }

  /**
   * Change subscription (unified endpoint for all pricing changes)
   */
  async changeSubscription (changeData) {
    this._requireReady('changeSubscription')
    if (!changeData || typeof changeData !== 'object') {
      throw new Error('Change data is required')
    }

    const { subscriptionId, planId, pricingKey, seats = 1, projectId, successUrl, cancelUrl } = changeData

    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }
    if (!pricingKey) {
      throw new Error('Pricing key is required')
    }

    try {
      const response = await this._request(`/subscriptions/${subscriptionId}/change`, {
        method: 'POST',
        body: JSON.stringify({
          planId,
          pricingKey,
          seats,
          projectId,
          successUrl,
          cancelUrl
        }),
        methodName: 'changeSubscription'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to change subscription: ${error.message}`, { cause: error })
    }
  }

  /**
   * Downgrade subscription to free plan
   */
  async downgrade (downgradeData) {
    this._requireReady('downgrade')
    if (!downgradeData || typeof downgradeData !== 'object') {
      throw new Error('Downgrade data is required')
    }

    const { subscriptionId, reason } = downgradeData

    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    try {
      const response = await this._request(`/subscriptions/${subscriptionId}/downgrade`, {
        method: 'POST',
        body: JSON.stringify({
          reason
        }),
        methodName: 'downgrade'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to downgrade subscription: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to change subscription with validation
   */
  async changeSubscriptionWithValidation (changeData) {
    if (!changeData || typeof changeData !== 'object') {
      throw new Error('Change data must be a valid object')
    }

    // Basic validation for required fields
    const requiredFields = ['subscriptionId', 'pricingKey']
    for (const field of requiredFields) {
      if (!changeData[field]) {
        throw new Error(`Required field '${field}' is missing`)
      }
    }

    // Validate seats is a positive integer if provided
    if (changeData.seats != null) {
      if (!Number.isInteger(changeData.seats) || changeData.seats < 1) {
        throw new Error('Seats must be a positive integer')
      }
    }

    // Validate subscriptionId is a string
    if (typeof changeData.subscriptionId !== 'string') {
      throw new Error('Subscription ID must be a valid string')
    }

    // Validate planId is a string if provided
    if (changeData.planId && typeof changeData.planId !== 'string') {
      throw new Error('Plan ID must be a valid string')
    }

    return await this.changeSubscription(changeData)
  }

  /**
   * Helper method to downgrade subscription with validation
   */
  async downgradeWithValidation (downgradeData) {
    if (!downgradeData || typeof downgradeData !== 'object') {
      throw new Error('Downgrade data must be a valid object')
    }

    // Validate subscriptionId is required and is a string
    if (!downgradeData.subscriptionId) {
      throw new Error('Subscription ID is required')
    }
    if (typeof downgradeData.subscriptionId !== 'string') {
      throw new Error('Subscription ID must be a valid string')
    }

    // Validate reason is a string if provided
    if (downgradeData.reason && typeof downgradeData.reason !== 'string') {
      throw new Error('Reason must be a valid string')
    }

    return await this.downgrade(downgradeData)
  }
}
