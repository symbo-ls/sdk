import { BaseService } from './BaseService.js'

export class PlanService extends BaseService {
  // ==================== PLAN METHODS ====================

  /**
   * Get list of public plans (no authentication required)
   */
  async getPlans () {
    try {
      const response = await this._request('/plans', {
        method: 'GET',
        methodName: 'getPlans'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get plans: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get list of public plans with enhanced pricing information (no authentication required)
   */
  async getPlansWithPricing () {
    try {
      const response = await this._request('/plans/pricing', {
        method: 'GET',
        methodName: 'getPlansWithPricing'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get plans with pricing: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Get a specific plan by ID (no authentication required)
   */
  async getPlan (planId) {
    if (!planId) {
      throw new Error('Plan ID is required')
    }
    try {
      const response = await this._request(`/plans/${planId}`, {
        method: 'GET',
        methodName: 'getPlan'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get plan: ${error.message}`, { cause: error })
    }
  }

  // ==================== ADMIN PLAN METHODS ====================

  /**
   * Get all plans including inactive ones (admin only)
   */
  async getAdminPlans () {
    this._requireReady('getAdminPlans')
    try {
      const response = await this._request('/admin/plans', {
        method: 'GET',
        methodName: 'getAdminPlans'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get admin plans: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Create a new plan (admin only)
   */
  async createPlan (planData) {
    this._requireReady('createPlan')
    if (!planData || typeof planData !== 'object') {
      throw new Error('Plan data is required')
    }
    try {
      const response = await this._request('/admin/plans', {
        method: 'POST',
        body: JSON.stringify(planData),
        methodName: 'createPlan'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create plan: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Update an existing plan (admin only)
   */
  async updatePlan (planId, planData) {
    this._requireReady('updatePlan')
    if (!planId) {
      throw new Error('Plan ID is required')
    }
    if (!planData || typeof planData !== 'object') {
      throw new Error('Plan data is required')
    }
    try {
      const response = await this._request(`/admin/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify(planData),
        methodName: 'updatePlan'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update plan: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Delete a plan (soft delete + archive Stripe product) (admin only)
   */
  async deletePlan (planId) {
    this._requireReady('deletePlan')
    if (!planId) {
      throw new Error('Plan ID is required')
    }
    try {
      const response = await this._request(`/admin/plans/${planId}`, {
        method: 'DELETE',
        methodName: 'deletePlan'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete plan: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Initialize default plans (admin only)
   */
  async initializePlans () {
    this._requireReady('initializePlans')
    try {
      const response = await this._request('/admin/plans/initialize', {
        method: 'POST',
        methodName: 'initializePlans'
      })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to initialize plans: ${error.message}`, {
        cause: error
      })
    }
  }

  // ==================== PLAN HELPER METHODS ====================

  /**
   * Helper method to get plans with validation
   */
  async getPlansWithValidation () {
    try {
      const plans = await this.getPlans()
      if (!Array.isArray(plans)) {
        throw new Error('Invalid response format: plans should be an array')
      }
      return plans
    } catch (error) {
      throw new Error(`Failed to get plans with validation: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Helper method to get a plan by ID with validation
   */
  async getPlanWithValidation (planId) {
    if (!planId || typeof planId !== 'string') {
      throw new Error('Plan ID must be a valid string')
    }

    try {
      const plan = await this.getPlan(planId)
      if (!plan || typeof plan !== 'object') {
        throw new Error('Invalid plan data received')
      }
      return plan
    } catch (error) {
      throw new Error(`Failed to get plan with validation: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Helper method to create a plan with validation (admin only)
   */
  async createPlanWithValidation (planData) {
    if (!planData || typeof planData !== 'object') {
      throw new Error('Plan data must be a valid object')
    }

    // Basic validation for required fields to match server model
    const requiredFields = ['name', 'description']
    for (const field of requiredFields) {
      if (!planData[field]) {
        throw new Error(`Required field '${field}' is missing`)
      }
    }

    // Legacy field guard: bare "price" is no longer supported on the server
    if (Object.hasOwn(planData, 'price')) {
      throw new Error(
        'Field "price" is no longer supported. Use unified "pricingOptions" with "amount" instead.'
      )
    }

    // Validate unified pricingOptions structure if provided
    if (planData.pricingOptions != null) {
      if (
        !Array.isArray(planData.pricingOptions) ||
        planData.pricingOptions.length === 0
      ) {
        throw new Error(
          'pricingOptions must be a non-empty array when provided'
        )
      }

      const allowedIntervals = new Set(['month', 'year', 'week', 'day', null])
      planData.pricingOptions.forEach((option, index) => {
        if (!option || typeof option !== 'object') {
          throw new Error(`Pricing option at index ${index} must be an object`)
        }

        const { key, displayName, amount, interval, lookupKey } = option

        if (!key || typeof key !== 'string') {
          throw new Error(
            `Pricing option at index ${index} is missing required field 'key'`
          )
        }

        // Validate key format (alphanumeric and hyphens only)
        if (!/^[a-z0-9-]+$/u.test(key)) {
          throw new Error(
            `Pricing option key '${key}' must contain only lowercase letters, numbers, and hyphens`
          )
        }

        if (!displayName || typeof displayName !== 'string') {
          throw new Error(
            `Pricing option '${key}' is missing required field 'displayName'`
          )
        }

        if (typeof amount !== 'number' || amount < 0) {
          throw new Error(
            `Pricing option '${key}' must have a non-negative numeric 'amount'`
          )
        }

        if (interval !== null && !allowedIntervals.has(interval)) {
          throw new Error(
            `Pricing option '${key}' has invalid interval '${interval}'. Allowed: month, year, week, day or null`
          )
        }

        if (!lookupKey || typeof lookupKey !== 'string') {
          throw new Error(
            `Pricing option '${key}' is missing required field 'lookupKey'`
          )
        }
      })
    }

    // Optional: validate top-level key if provided (legacy support)
    if (Object.hasOwn(planData, 'key') && planData.key == null) {
      throw new Error('Plan key must be a valid string')
    }
    if (planData.key && !/^[a-z0-9-]+$/u.test(planData.key)) {
      throw new Error(
        'Plan key must contain only lowercase letters, numbers, and hyphens'
      )
    }

    return await this.createPlan(planData)
  }

  /**
   * Helper method to update a plan with validation (admin only)
   */
  async updatePlanWithValidation (planId, planData) {
    if (!planId || typeof planId !== 'string') {
      throw new Error('Plan ID must be a valid string')
    }
    if (!planData || typeof planData !== 'object') {
      throw new Error('Plan data must be a valid object')
    }

    // Legacy field guard: bare "price" is no longer supported on the server
    if (Object.hasOwn(planData, 'price')) {
      throw new Error(
        'Field "price" is no longer supported. Use unified "pricingOptions" with "amount" instead.'
      )
    }

    // Validate unified pricingOptions structure if provided
    if (planData.pricingOptions != null) {
      if (
        !Array.isArray(planData.pricingOptions) ||
        planData.pricingOptions.length === 0
      ) {
        throw new Error(
          'pricingOptions must be a non-empty array when provided'
        )
      }

      const allowedIntervals = new Set(['month', 'year', 'week', 'day', null])
      planData.pricingOptions.forEach((option, index) => {
        if (!option || typeof option !== 'object') {
          throw new Error(`Pricing option at index ${index} must be an object`)
        }

        const { key, displayName, amount, interval, lookupKey } = option

        if (!key || typeof key !== 'string') {
          throw new Error(
            `Pricing option at index ${index} is missing required field 'key'`
          )
        }

        // Validate key format (alphanumeric and hyphens only)
        if (!/^[a-z0-9-]+$/u.test(key)) {
          throw new Error(
            `Pricing option key '${key}' must contain only lowercase letters, numbers, and hyphens`
          )
        }

        if (!displayName || typeof displayName !== 'string') {
          throw new Error(
            `Pricing option '${key}' is missing required field 'displayName'`
          )
        }

        if (typeof amount !== 'number' || amount < 0) {
          throw new Error(
            `Pricing option '${key}' must have a non-negative numeric 'amount'`
          )
        }

        if (interval !== null && !allowedIntervals.has(interval)) {
          throw new Error(
            `Pricing option '${key}' has invalid interval '${interval}'. Allowed: month, year, week, day or null`
          )
        }

        if (!lookupKey || typeof lookupKey !== 'string') {
          throw new Error(
            `Pricing option '${key}' is missing required field 'lookupKey'`
          )
        }
      })
    }

    // Validate key format if provided
    if (Object.hasOwn(planData, 'key') && planData.key == null) {
      throw new Error('Plan key must be a valid string')
    }
    if (planData.key && !/^[a-z0-9-]+$/u.test(planData.key)) {
      throw new Error(
        'Plan key must contain only lowercase letters, numbers, and hyphens'
      )
    }

    return await this.updatePlan(planId, planData)
  }

  /**
   * Helper method to get active plans only
   */
  async getActivePlans () {
    try {
      const plans = await this.getPlans()
      // Server already returns only active & visible plans for /plans,
      // but we keep this helper aligned with the model fields.
      return plans.filter(
        plan => plan.status === 'active' && plan.isVisible !== false
      )
    } catch (error) {
      throw new Error(`Failed to get active plans: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Helper method to get plans by price range
   */
  async getPlansByPriceRange (minPrice = 0, maxPrice = Infinity) {
    try {
      // Use enhanced pricing information from /plans/pricing
      const plans = await this.getPlansWithPricing()
      return plans.filter(plan => {
        const price = plan?.pricing?.bestPrice?.amount ?? 0
        return price >= minPrice && price <= maxPrice
      })
    } catch (error) {
      throw new Error(`Failed to get plans by price range: ${error.message}`, {
        cause: error
      })
    }
  }

  /**
   * Helper method to find plan by key
   */
  async getPlanByKey (key) {
    if (!key) {
      throw new Error('Plan key is required')
    }

    try {
      const plans = await this.getPlans()
      const plan = plans.find(p => p.key === key)

      if (!plan) {
        throw new Error(`Plan with key '${key}' not found`)
      }

      return plan
    } catch (error) {
      throw new Error(`Failed to get plan by key: ${error.message}`, {
        cause: error
      })
    }
  }
}
