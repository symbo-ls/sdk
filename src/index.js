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
  createFeatureFlagService,
  createOrganizationService,
  createWorkspaceService,
  createWorkspaceProjectService,
  createWorkspaceDataService,   // deprecated alias for backward compat
  createKvService,
  createAllocationRuleService,
  createSharedAssetService,
  createCreditsService
} from './services/index.js'

import { SERVICE_METHODS } from './utils/services.js'
import environment from './config/environment.js'
import { rootBus } from './state/rootEventBus.js'
import { logger, setDebug } from './utils/logger.js'
import { createEntityDispatcher, registerEntity } from './services/EntityDispatcher.js'

const isBrowserEnvironment = () => typeof window !== 'undefined'

export const isLocalhost = () => {
  if (!isBrowserEnvironment()) {
    return false
  }
  const host = window.location && window.location.hostname
  return host === 'localhost' || host?.endsWith('.localhost') || host === '127.0.0.1' || host === '::1' || host === '' || !host
}

export class SDK {
  constructor (options = {}) {
    this._services = new Map()
    this._context = {}
    this._options = this._validateOptions(options)

    // Seed context with apiUrl from options so services resolve the correct host
    if (this._options.apiUrl) {
      this._context.apiUrl = this._options.apiUrl
    }

    // Enable logger output when debug mode is on
    setDebug(this._options.debug)

    // Expose resolved environment config on SDK instance
    this.environment = environment

    // Expose root event bus on SDK instance
    this.rootBus = rootBus

    // Create proxy methods for direct service access
    this._createServiceProxies()

    // Single dispatcher entry point for the fetch plugin's 'sdk' adapter.
    // Maps dotted entity paths (e.g. 'workspaceProject.tickets') to existing
    // service methods. See services/EntityDispatcher.js.
    this.execute = createEntityDispatcher(this)
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
      ),
      this._initService(
        'organization',
        createOrganizationService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'workspace',
        createWorkspaceService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'workspaceProject',
        createWorkspaceProjectService({
          context: this._context,
          options: this._options
        })
      ).then(() => {
        // Backward-compat: 'workspaceData' alias for the renamed
        // WorkspaceProjectService. External consumers using
        // sdk.getService('workspaceData') keep working through one
        // deprecation cycle.
        const wp = this._services.get('workspaceProject')
        if (wp) {
          this._services.set('workspaceData', wp)
          this._context.services = {
            ...this._context.services,
            workspaceData: wp,
          }
        }
      }),
      this._initService(
        'kv',
        createKvService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'allocationRule',
        createAllocationRuleService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'sharedAsset',
        createSharedAssetService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'credits',
        createCreditsService({
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
        // Faro/Grafana tracking globally disabled — the collector endpoint
        // rejects CORS from our preview domains, so every call spams the
        // console with preflight failures. Re-enable per-caller via
        // `options.tracking.enabled = true` when a valid origin is allowed.
        enabled: false
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

  // Switch the active organization. Resets internal SDK state that's scoped
  // to an org so the next call uses the new org's claims/clients/caches.
  //
  // Caller is responsible for telling each service ABOUT the new orgId via
  // updateContext({ activeOrgId }) — that's already part of this method. Any
  // org-scoped fetch caches in consumers (e.g. queryClient in the fetch
  // plugin) should be invalidated by the caller separately.
  //
  // What this method clears internally:
  //   - TokenManager: any cached claims that include the old orgId (the next
  //     refresh will mint with the new claim).
  //   - CollabService active subscriptions tied to projects in the old org.
  //   - WorkspaceProjectService cached prefix (recomputed lazily on next call).
  //   - Per-service cached state via service.switchOrg(newOrgId) when the
  //     service implements that hook (additive — services without the hook
  //     are skipped).
  async switchOrg (newOrgId) {
    if (!newOrgId) throw new Error('[sdk.switchOrg] newOrgId is required')
    const previousOrgId = this._context.activeOrgId
    if (previousOrgId === newOrgId) return { changed: false, orgId: newOrgId }

    // Update context so every service sees the new org on next access.
    this.updateContext({ activeOrgId: newOrgId })

    // Token manager — clear cached claims so next request re-mints
    if (this._tokenManager?.invalidateClaims) {
      try { this._tokenManager.invalidateClaims() } catch {}
    }

    // Walk services; if a service exposes its own switchOrg hook, call it.
    // Services that don't implement it are silently skipped (additive surface).
    const switchPromises = []
    for (const [name, service] of this._services.entries()) {
      if (typeof service.switchOrg === 'function') {
        switchPromises.push(
          Promise.resolve(service.switchOrg(newOrgId, previousOrgId)).catch((err) => {
            logger.error(`[sdk.switchOrg] Service '${name}' switchOrg failed:`, err)
          })
        )
      }
    }
    await Promise.all(switchPromises)

    // Emit on root bus so external consumers (fetch plugin's queryClient,
    // shell state managers, etc.) can react and clear their own caches.
    this.rootBus?.emit?.('sdk.orgSwitched', { previousOrgId, newOrgId })

    return { changed: true, previousOrgId, newOrgId }
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
          logger.log(`Service ${name} destroyed successfully`)
        })

      await Promise.all(destroyPromises)

      // Clear services and reset state
      this._services.clear()
      this._context = {}

      return true
    } catch (error) {
      logger.error('Error during SDK destruction:', error)
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
  createFeatureFlagService,
  createOrganizationService,
  createWorkspaceService,
  createWorkspaceProjectService,
  createWorkspaceDataService,   // deprecated alias for backward compat
  createKvService,
  createAllocationRuleService,
  createSharedAssetService,
  createCreditsService
} from './services/index.js'

// Re-export entity dispatcher helpers so external packages (e.g. plugins
// extending the fetch adapter) can add their own routes at boot.
export { registerEntity, createEntityDispatcher } from './services/EntityDispatcher.js'

// Export environment configuration
export { default as environment } from './config/environment.js'
