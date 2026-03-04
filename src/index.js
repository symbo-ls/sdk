import {
  createAuthService,
  createCollabService,
  createProjectService,
  createPlanService,
  createFileService,
  createPaymentService,
  createDnsService,
  createBranchService,
  createPullRequestService,
  createAdminService,
  createSubscriptionService,
  createScreenshotService,
  createTrackingService,
  createWaitlistService,
  createMetricsService,
  createIntegrationService,
  createFeatureFlagService
} from './services/index.js'

import { SERVICE_METHODS } from './utils/services.js'
import environment from './config/environment.js'
import { rootBus } from './state/rootEventBus.js'

const isBrowserEnvironment = () => typeof window !== 'undefined'

export const isLocalhost = () => {
  if (!isBrowserEnvironment()) {
    return false
  }
  const host = window.location && window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '' || !host
}

export class SDK {
  constructor (options = {}) {
    this._services = new Map()
    this._context = {}
    this._options = this._validateOptions(options)

    // Expose resolved environment config on SDK instance
    this.environment = environment

    // Expose root event bus on SDK instance
    this.rootBus = rootBus

    // Create proxy methods for direct service access
    this._createServiceProxies()
  }

  // Initialize SDK with context
  async initialize (context = {}) {
    this._context = {
      ...this._context,
      ...context
    }

    //
    // Initialize services with context
    await Promise.all([
      this._initService(
        'auth',
        createAuthService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'collab',
        createCollabService({
          context: this._context,
          options: this._options
        })
      ),
      // Initialize new modular services
      this._initService(
        'project',
        createProjectService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'plan',
        createPlanService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'subscription',
        createSubscriptionService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'file',
        createFileService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'payment',
        createPaymentService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'dns',
        createDnsService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'branch',
        createBranchService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'pullRequest',
        createPullRequestService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'admin',
        createAdminService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'screenshot',
        createScreenshotService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'tracking',
        createTrackingService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'waitlist',
        createWaitlistService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'metrics',
        createMetricsService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'integration',
        createIntegrationService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'featureFlag',
        createFeatureFlagService({
          context: this._context,
          options: this._options
        })
      )
    ])

    return this
  }

  // Private helper to initialize a service
  async _initService (name, service) {
    // Add service reference to context for inter-service communication
    this._context.services = {
      ...this._context.services,
      [name]: service
    }

    // Initialize service with context
    await service.init({
      context: this._context,
      options: this._options
    })

    this._services.set(name, service)
  }

  _validateOptions (options) {
    const onLocalhost = isLocalhost()
    const hasGrafanaUrl = Boolean(environment.grafanaUrl)
    const defaults = {
      useNewServices: true, // Use new service implementations by default
      apiUrl: environment.apiUrl,
      socketUrl: environment.socketUrl,
      timeout: 30000,
      retryAttempts: 3,
      debug: false,
      tracking: {
        // Force-disabled on localhost or when no Grafana URL is configured
        enabled: onLocalhost ? false : (hasGrafanaUrl ? environment.features.trackingEnabled : false)
      }
    }

    const merged = {
      ...defaults,
      ...options,
      tracking: {
        ...defaults.tracking,
        ...(options.tracking || {})
      }
    }

    // Enforce disabled tracking on localhost or when no Grafana URL configured, even if overridden
    if (onLocalhost || !hasGrafanaUrl) {
      merged.tracking.enabled = false
    }

    return merged
  }

  // Get service instance
  getService (name) {
    if (!this._services.has(name)) {
      throw new Error(`Service '${name}' not found`)
    }
    return this._services.get(name)
  }

  // Update context
  updateContext (newContext) {
    // Do not persist authToken in SDK context; TokenManager is the source of truth
    const { ...sanitized } = newContext || {}

    this._context = {
      ...this._context,
      ...sanitized
    }

    // Update context for all services
    for (const service of this._services.values()) {
      service.updateContext(this._context)
    }
  }

  // Check if SDK is ready
  isReady () {
    const sdkServices = Array.from(this._services.values())
    return (
      sdkServices.length > 0 &&
      sdkServices.every((service) => service.isReady())
    )
  }

  // Get SDK status
  getStatus () {
    return {
      ready: this.isReady(),
      services: Array.from(this._services.entries()).map(([name, service]) => ({
        name,
        ...service.getStatus()
      })),
      context: { ...this._context }
    }
  }

  // Create proxy methods for direct service access
  _createServiceProxies () {
    for (const [methodName, serviceName] of Object.entries(SERVICE_METHODS)) {
      // Skip if method already exists on SDK
      if (!this[methodName]) {
        // Create proxy method
        this[methodName] = (...args) => {
          const service = this.getService(serviceName)
          if (!service[methodName]) {
            throw new Error(
              `Method '${methodName}' not found on service '${serviceName}'`
            )
          }
          return service[methodName](...args)
        }
      }
    }
  }

  /**
   * Destroys all services and cleans up resources
   * @returns {Promise<boolean>} Returns true when cleanup is complete
   */
  async destroy () {
    try {
      // Call destroy on all services
      const destroyPromises = Array.from(this._services.entries())
        .filter(([, service]) => typeof service.destroy === 'function')
        .map(async ([name, service]) => {
          await service.destroy()
          console.log(`Service ${name} destroyed successfully`)
        })

      await Promise.all(destroyPromises)

      // Clear services and reset state
      this._services.clear()
      this._context = {}

      return true
    } catch (error) {
      console.error('Error during SDK destruction:', error)
      throw error
    }
  }
}

export default SDK

// Export services for direct usage
export {
  createAuthService,
  createCollabService,
  createProjectService,
  createPlanService,
  createFileService,
  createPaymentService,
  createDnsService,
  createBranchService,
  createPullRequestService,
  createAdminService,
  createSubscriptionService,
  createTrackingService,
  createWaitlistService,
  createMetricsService,
  createIntegrationService,
  createFeatureFlagService
} from './services/index.js'

// Export environment configuration
export { default as environment } from './config/environment.js'
