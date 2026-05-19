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
  createTicketService,
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
    // Maps dotted entity paths (e.g. 'tickets', 'organization.members') to
    // existing service methods. See services/EntityDispatcher.js.
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
      ),
      this._initService(
        'tickets',
        createTicketService({
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
    const defaults = {
      useNewServices: true, // Use new service implementations by default
      apiUrl: environment.apiUrl,
      socketUrl: environment.socketUrl,
      timeout: 30000,
      retryAttempts: 3,
      debug: false,
      tracking: {
        // Off by default. TrackingService is now backed by @symbo.ls/analyzing
        // → workspace-project worker → analyzed_* tables. The workspace shell
        // boots its own analyzing instance directly (workspace/packages/
        // workspace/analyzing.js), so leaving TrackingService disabled by
        // default avoids double-instrumentation. Consumers that want
        // tracking on the SDK surface itself can opt in via
        // `options.tracking.enabled = true`.
        enabled: false
      }
    }

    return {
      ...defaults,
      ...options,
      tracking: {
        ...defaults.tracking,
        ...(options.tracking || {})
      }
    }
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

  // Switch the active organization — the single canonical entry point for
  // changing org context. Atomically:
  //
  //   1. Writes Mongo `User.activeOrganization` via
  //      `setActiveOrganization` (skipped when `opts.skipPersist === true`,
  //      e.g. echo from socket fan-out).
  //   2. Updates SDK `_context.activeOrgId` so every service sees the new
  //      org on next access.
  //   3. Invalidates TokenManager cached claims (next request re-mints).
  //   4. Walks per-service `switchOrg(newOrgId, previousOrgId)` hooks.
  //   5. Federates workspace-project Supabase to the new org's home
  //      workspace via `switchWorkspace`, IF `opts.homeWorkspaceId` is
  //      supplied AND `opts.skipFederation !== true`. This keeps Mongo
  //      and the workspace-project session pointing at the same org —
  //      without it, RLS-scoped reads (announcements, tickets, chat,
  //      calendar, …) silently stay scoped to the previous workspace.
  //   6. Emits `sdk.orgSwitched` on rootBus.
  //
  // Opts:
  //   skipPersist     — don't PATCH Mongo (use this in socket-echo paths
  //                     where another session already persisted).
  //   skipFederation  — don't refresh the workspace-project Supabase JWT
  //                     (use for the rare org with no federated workspace,
  //                     or when the caller wants to manage the federation
  //                     hop separately).
  //   homeWorkspaceId — the workspace-project Supabase workspace id whose
  //                     `org_id === newOrgId`. Callers compute this from
  //                     their `root.jwtClaims.workspaces` snapshot (or
  //                     equivalent). When omitted, no federation hop runs
  //                     and Mongo-only state advances.
  //
  // If `setActiveOrganization` throws, the whole switch aborts BEFORE
  // touching local context — Mongo's pre-write state is the source of
  // truth, and the UI must stay pointed at the previous org so a failed
  // server write doesn't leave the user looking at a context that
  // server-side reads will reject.
  async switchOrg (newOrgId, opts = {}) {
    if (!newOrgId) throw new Error('[sdk.switchOrg] newOrgId is required')
    const previousOrgId = this._context.activeOrgId
    if (previousOrgId === newOrgId) return { changed: false, orgId: newOrgId }
    const { skipPersist = false, skipFederation = false, homeWorkspaceId = null } = opts

    // 1. Persist to Mongo FIRST. If this fails, we never touched local
    //    context; the caller surfaces the error and the UI stays put.
    let persistResult = null
    if (!skipPersist && typeof this.setActiveOrganization === 'function') {
      persistResult = await this.setActiveOrganization(newOrgId)
    }

    // 2. Local context — every service sees the new org on next access.
    this.updateContext({ activeOrgId: newOrgId })

    // 3. Token manager — clear cached claims so next request re-mints.
    if (this._tokenManager?.invalidateClaims) {
      try { this._tokenManager.invalidateClaims() } catch {}
    }

    // 4. Walk per-service switchOrg hooks. Services that don't implement
    //    the hook are silently skipped (additive surface).
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

    // 5. Federate workspace-project Supabase to the org's home workspace
    //    so RLS-scoped reads re-scope. Errors here don't abort: Mongo
    //    is already updated and the SDK-side context advanced; a Supabase
    //    federation hiccup is recoverable (the next JWT refresh will
    //    settle it) and shouldn't roll back the org switch.
    let federationResult = null
    if (!skipFederation && homeWorkspaceId && typeof this.switchWorkspace === 'function') {
      try {
        federationResult = await this.switchWorkspace(homeWorkspaceId)
      } catch (err) {
        logger.warn('[sdk.switchOrg] switchWorkspace federation failed:', err?.message || err)
      }
    }

    // 6. Emit on rootBus so external consumers (fetch plugin's queryClient,
    //    shell state managers, workspace's onWorkspaceChange pipeline)
    //    react and clear their own caches.
    this.rootBus?.emit?.('sdk.orgSwitched', {
      previousOrgId,
      newOrgId,
      persist: persistResult,
      federation: federationResult,
    })

    return {
      changed: true,
      previousOrgId,
      newOrgId,
      persist: persistResult,
      federation: federationResult,
    }
  }

  // Switch the active workspace within the current org. The federation
  // layer (governance Supabase + symbols-auth-bridge edge fn) is what
  // actually re-mints the JWT with the new `active_workspace_id` claim;
  // this method orchestrates that via the optional
  // `context.federationSwitchWorkspace` callback registered at init time.
  //
  // Frontend contract:
  //   await sdk.switchWorkspace(workspaceId)
  // — single entry point. Federation, state cleanup, event emission, and
  // localStorage persistence are all SDK-internal.
  //
  // Returns the federation result so the caller can decide on UI feedback
  // (e.g. dismiss a transition overlay only on { ok: true }).
  async switchWorkspace (newWorkspaceId) {
    if (!newWorkspaceId) throw new Error('[sdk.switchWorkspace] workspaceId is required')
    const previousWorkspaceId = this._context.activeWorkspaceId
    if (previousWorkspaceId === newWorkspaceId) {
      return { ok: true, changed: false, workspaceId: newWorkspaceId }
    }

    // Run federation refresh first — if the bridge rejects (forbidden,
    // network error), bail BEFORE clearing local state so the UI stays
    // pointed at the still-valid old workspace.
    let federationResult = { ok: true }
    const federationFn = this._context.federationSwitchWorkspace
    if (typeof federationFn === 'function') {
      federationResult = await federationFn(newWorkspaceId)
      if (!federationResult?.ok) {
        return { ok: false, error: federationResult?.error, federation: federationResult }
      }
    }

    this.updateContext({ activeWorkspaceId: newWorkspaceId })

    if (this._tokenManager?.invalidateClaims) {
      try { this._tokenManager.invalidateClaims() } catch {}
    }

    // Walk services; per-service switchWorkspace hooks get notified.
    const switchPromises = []
    for (const [name, service] of this._services.entries()) {
      if (typeof service.switchWorkspace === 'function') {
        switchPromises.push(
          Promise.resolve(service.switchWorkspace(newWorkspaceId, previousWorkspaceId)).catch((err) => {
            logger.error(`[sdk.switchWorkspace] Service '${name}' switchWorkspace failed:`, err)
          })
        )
      }
    }
    await Promise.all(switchPromises)

    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      try { globalThis.localStorage.setItem('activeWorkspace', newWorkspaceId) } catch {}
    }

    this.rootBus?.emit?.('sdk.workspaceSwitched', { previousWorkspaceId, newWorkspaceId })

    return { ok: true, changed: true, previousWorkspaceId, newWorkspaceId, federation: federationResult }
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
  createTicketService,
  createAllocationRuleService,
  createSharedAssetService,
  createCreditsService,
  workspaceProjectBaseUrl,
  createSupabasePassthroughConfig,
  workspaceProjectEdgeFunctionUrl,
  governanceSessionAccessToken
} from './services/index.js'

// Re-export entity dispatcher helpers so external packages (e.g. plugins
// extending the fetch adapter) can add their own routes at boot.
export { registerEntity, createEntityDispatcher } from './services/EntityDispatcher.js'

// Export environment configuration
export { default as environment } from './config/environment.js'
