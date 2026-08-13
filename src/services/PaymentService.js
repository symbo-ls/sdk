import { BaseService } from './BaseService.js'
import { logger } from '../utils/logger.js'

export class PaymentService extends BaseService {
  // ==================== PAYMENT METHODS ====================

  // tickets/opus.md PRICE-5 — body-shape defect fix. This used to send
  // `{ projectId, seats, price, successUrl, cancelUrl }` to
  // `POST /payments/checkout`, but the controller
  // (`server/src/domains/billing/controllers/PaymentController.js
  // createCheckout`) destructures `{ projectId, planId, pricingKey, seats,
  // successUrl, cancelUrl }` and guards `if (!projectId || !planId ||
  // !pricingKey) throw` — `price` was silently ignored and every call
  // 400'd with "Project ID, Plan ID, and Pricing Key are required".
  // Fixed to send `planId` (a real Mongo Plan `_id`, NOT a Stripe lookup
  // key — see `checkoutForPlan`/`checkoutForTeam` below, which used to
  // pass a lookup-key string here and needed the same correction) plus
  // `pricingKey`, matching the controller's actual contract.
  async checkout (options = {}) {
    this._requireReady('checkout')
    const {
      projectId,
      seats = 1,
      planId,
      pricingKey = 'monthly',
      successUrl = `${window.location.origin}/success`,
      cancelUrl = `${window.location.origin}/pricing`
    } = options

    if (!projectId) {
      throw new Error('Project ID is required for checkout')
    }
    if (!planId) {
      throw new Error('Plan ID is required for checkout')
    }

    try {
      const response = await this._request('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          seats,
          planId,
          pricingKey,
          successUrl,
          cancelUrl
        }),
        methodName: 'checkout'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to checkout: ${error.message}`, { cause: error })
    }
  }

  async getSubscriptionStatus (projectId) {
    this._requireReady('getSubscriptionStatus')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(
        `/payments/subscription/${projectId}`,
        {
          method: 'GET',
          methodName: 'getSubscriptionStatus'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get subscription status: ${error.message}`, { cause: error })
    }
  }

  // ==================== PAYMENT HELPER METHODS ====================

  /**
   * Helper method to create checkout with validation
   */
  async checkoutWithValidation (options = {}) {
    const {
      projectId,
      seats,
      planId,
      successUrl,
      cancelUrl
    } = options

    // Validate required fields
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    if (seats && (typeof seats !== 'number' || seats < 1)) {
      throw new Error('Seats must be a positive number')
    }

    if (planId && typeof planId !== 'string') {
      throw new Error('Plan ID must be a string')
    }

    // Validate URLs if provided
    if (successUrl && !this._isValidUrl(successUrl)) {
      throw new Error('Success URL must be a valid URL')
    }

    if (cancelUrl && !this._isValidUrl(cancelUrl)) {
      throw new Error('Cancel URL must be a valid URL')
    }

    return await this.checkout(options)
  }

  /**
   * Helper method to get subscription status with validation
   */
  async getSubscriptionStatusWithValidation (projectId) {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Project ID must be a valid string')
    }

    return await this.getSubscriptionStatus(projectId)
  }

  /**
   * Helper method to check if project has active subscription
   */
  async hasActiveSubscription (projectId) {
    try {
      const status = await this.getSubscriptionStatus(projectId)
      return status?.active === true
    } catch (error) {
      logger.warn('Failed to check subscription status:', error.message)
      return false
    }
  }

  /**
   * Helper method to get subscription details
   */
  async getSubscriptionDetails (projectId) {
    try {
      const status = await this.getSubscriptionStatus(projectId)

      if (!status) {
        return {
          hasSubscription: false,
          active: false,
          message: 'No subscription found'
        }
      }

      return {
        hasSubscription: true,
        active: status.active || false,
        plan: status.plan,
        seats: status.seats,
        nextBillingDate: status.nextBillingDate,
        amount: status.amount,
        currency: status.currency,
        status: status.status
      }
    } catch (error) {
      throw new Error(`Failed to get subscription details: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to create checkout for a specific plan.
   * `planId` must be a real Mongo `Plan._id` — the controller resolves the
   * Stripe price server-side via `Plan.getPricingOption`, it no longer
   * accepts a Stripe lookup key directly (PRICE-5 body-shape fix).
   */
  async checkoutForPlan (projectId, planId, options = {}) {
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!planId) {
      throw new Error('Plan ID is required')
    }

    const checkoutOptions = {
      projectId,
      planId,
      ...options
    }

    return await this.checkoutWithValidation(checkoutOptions)
  }

  /**
   * Helper method to create checkout for the Team plan. Previously
   * hardcoded the Stripe lookup key `'team_monthly'` as `price` — that
   * key is not a valid `planId` (a Mongo ObjectId varies per environment/
   * seed), so this now requires the caller to resolve and pass the real
   * Team `Plan._id` via `options.planId` (e.g. from
   * `sdk.getPlansWithPricing()`) rather than guessing one.
   */
  async checkoutForTeam (projectId, seats, options = {}) {
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!seats || seats < 1) {
      throw new Error('Seats must be a positive number')
    }
    if (!options.planId) {
      throw new Error(
        'Plan ID is required — pass options.planId (a real Plan _id resolved via ' +
        'sdk.getPlansWithPricing(); the old "team_monthly" Stripe lookup key is not a valid planId)'
      )
    }

    const checkoutOptions = {
      projectId,
      seats,
      ...options
    }

    return await this.checkoutWithValidation(checkoutOptions)
  }

  /**
   * Helper method to validate subscription status
   */
  validateSubscriptionStatus (status) {
    if (!status || typeof status !== 'object') {
      return {
        isValid: false,
        error: 'Invalid subscription status format'
      }
    }

    const requiredFields = ['active', 'plan', 'seats']
    const missingFields = requiredFields.filter(field => !(field in status))

    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      }
    }

    return {
      isValid: true,
      error: null
    }
  }

  /**
   * Helper method to format subscription amount
   */
  formatSubscriptionAmount (amount, currency = 'USD') {
    if (!amount || typeof amount !== 'number') {
      return 'N/A'
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount / 100) // Assuming amount is in cents
  }

  /**
   * Helper method to get subscription summary
   */
  async getSubscriptionSummary (projectId) {
    try {
      const details = await this.getSubscriptionDetails(projectId)

      if (!details.hasSubscription) {
        return {
          status: 'no_subscription',
          message: 'No active subscription',
          action: 'subscribe'
        }
      }

      if (!details.active) {
        return {
          status: 'inactive',
          message: 'Subscription is inactive',
          action: 'reactivate'
        }
      }

      return {
        status: 'active',
        message: `Active ${details.plan} plan with ${details.seats} seats`,
        action: 'manage',
        details
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to get subscription: ${error.message}`,
        action: 'retry'
      }
    }
  }

  /**
   * Private helper to validate URL
   */
  _isValidUrl (string) {
    try {
      const url = new URL(string)
      return Boolean(url)
    } catch {
      return false
    }
  }
}
