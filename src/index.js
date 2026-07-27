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
  createAiChatService,
  createAiService,
  createDocService,
  createResourceLinkService,
  createTicketService,
  createAnalyzedService,
  createProposedActionService,
  createWorkflowService,
  createFieldDefService,
  createRecordCollectionService,
  createPartyService,
  createInteractionService,
  createSegmentService,
  createProductService,
  createPriceService,
  createCompanyProfileService,
  createAgreementService,
  createInvoiceService,
  createTransactionService,
  createCommentService,
  createAttachmentService,
  createWatcherService,
  createActivityEntryService,
  createTagService,
  createBookingService,
  createAvailabilityRuleService,
  createConversationService,
  createRecurrenceService,
  createAllocationRuleService,
  createSharedAssetService,
  createCreditsService,
  createCanvasLayoutService,
  createMeetService,
  createCalendarService,
  createBuildsService,
  workspaceProjectBaseUrl
} from './services/index.js'

import { SERVICE_METHODS } from './utils/services.js'
import environment from './config/environment.js'
import { rootBus } from './state/rootEventBus.js'
import { logger, setDebug } from './utils/logger.js'
import {
  createEntityDispatcher,
  registerEntity
} from './services/EntityDispatcher.js'

const isBrowserEnvironment = () => typeof window !== 'undefined'

export const isLocalhost = () => {
  if (!isBrowserEnvironment()) {
    return false
  }
  const host = window.location && window.location.hostname
  return (
    host === 'localhost' ||
    host?.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '' ||
    !host
  )
}

export class SDK {
  constructor(options = {}) {
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
  async initialize(context = {}) {
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
        'aiChat',
        createAiChatService({
          context: this._context,
          options: this._options
        })
      ),
      // Unified AI surface. Wraps aiChat's transport for HTTP modes
      // (simone, providers), and owns the WebSocket bridge for local mode.
      // Adds intent classification (build/answer/action) + authMode
      // (ask/auto) on top. Every UI consumer should call sdk.ai.dispatch
      // instead of poking aiChat directly so the mode + intent routing
      // lives in one place.
      this._initService(
        'ai',
        createAiService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'docs',
        createDocService({
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
        'analyzed',
        createAnalyzedService({
          context: this._context,
          options: this._options
        })
      ),
      // Phase-1 spine services (WORKSPACE_DATA_MODEL §6.5/§6.8/§7/§8) —
      // proposed-actions (approval spine), workflows (stage sequences),
      // field-defs (custom fields), record-collections (custom objects).
      this._initService(
        'proposedActions',
        createProposedActionService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'workflows',
        createWorkflowService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'fieldDefs',
        createFieldDefService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'recordCollections',
        createRecordCollectionService({
          context: this._context,
          options: this._options
        })
      ),
      // Phase-2 directory (WORKSPACE_DATA_MODEL §5) — the Party Directory:
      // parties (+ roles/relationships sub-resources), interactions, segments.
      this._initService(
        'parties',
        createPartyService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'interactions',
        createInteractionService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'segments',
        createSegmentService({
          context: this._context,
          options: this._options
        })
      ),
      // Phase-3 commerce (WORKSPACE_DATA_MODEL §6.2/§6.3/§6.4) — the
      // tenant-finance spine: catalog (products + prices), company-profile
      // (workspace singleton), agreements, invoices (+ /issue + void-delete),
      // transactions (+ allocation settlement). Mongo-native; reached via
      // sdk.execute('invoices', …) like parties/workflows.
      this._initService(
        'products',
        createProductService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'prices',
        createPriceService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'companyProfile',
        createCompanyProfileService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'agreements',
        createAgreementService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'invoices',
        createInvoiceService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'transactions',
        createTransactionService({
          context: this._context,
          options: this._options
        })
      ),
      // §7 spine capabilities (WORKSPACE_DATA_MODEL §7.3–§7.6/§6.9) — comments
      // (threaded discussion), attachments (files on anything), watchers
      // (subscribe anyone to anything), activityEntries (read-only timeline),
      // tags (workspace tag registry). All keyed on entityRef { type, id };
      // Mongo-native, reached via sdk.execute('comments', …) like
      // parties/workflows/invoices.
      this._initService(
        'comments',
        createCommentService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'attachments',
        createAttachmentService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'watchers',
        createWatcherService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'activityEntries',
        createActivityEntryService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'tags',
        createTagService({
          context: this._context,
          options: this._options
        })
      ),
      // Phase-4 scheduling (WORKSPACE_DATA_MODEL §6.5/§6.7/§6.8) — the
      // scheduling & service surfaces: bookings (party-facing commitments,
      // + /confirm + cancel-delete), availability-rules (per-user freebusy),
      // conversations (two-way threads + a /messages sub-resource),
      // recurrences (the generic rrule scheduler). Mongo-native; reached via
      // sdk.execute('bookings', …) like parties/invoices/comments.
      this._initService(
        'bookings',
        createBookingService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'availabilityRules',
        createAvailabilityRuleService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'conversations',
        createConversationService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'recurrences',
        createRecurrenceService({
          context: this._context,
          options: this._options
        })
      ),
      this._initService(
        'resourceLinks',
        createResourceLinkService({
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
      ),
      this._initService(
        'canvasLayout',
        createCanvasLayoutService({
          context: this._context,
          options: this._options
        })
      ),
      // Builds & Deploy — /core/builds/* pipeline behind the /infra canvas.
      this._initService(
        'builds',
        createBuildsService({
          context: this._context,
          options: this._options
        })
      ),
      // Meet — guest waiting-room flow (anonymous) + host remote mute
      // against /core/meet/* on the main server.
      this._initService(
        'meet',
        createMeetService({
          context: this._context,
          options: this._options
        })
      ),
      // Calendar — workspace-scoped events against /core/calendar/* on the
      // main server. Live (Mongo-backed since 2026-07-03). Writes are
      // owner/admin-gated.
      this._initService(
        'calendar',
        createCalendarService({
          context: this._context,
          options: this._options
        })
      )
    ])

    return this
  }

  // Private helper to initialize a service
  async _initService(name, service) {
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

  _validateOptions(options) {
    const defaults = {
      useNewServices: true, // Use new service implementations by default
      apiUrl: environment.apiUrl,
      socketUrl: environment.socketUrl,
      timeout: 30000,
      retryAttempts: 3,
      debug: false,
      tracking: {
        // Off by default. TrackingService is now backed by @symbo.ls/analyzing
        // → AnalyzedService → the main server's Mongo-backed
        // /core/analyzed/ingest route. The workspace shell boots its own
        // analyzing instance directly (workspace/packages/
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
  getService(name) {
    if (!this._services.has(name)) {
      throw new Error(`Service '${name}' not found`)
    }
    return this._services.get(name)
  }

  // Update context
  updateContext(newContext) {
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
  //   5. Aligns the ACTIVE WORKSPACE to the new org's home workspace via
  //      `switchWorkspace`, IF `opts.homeWorkspaceId` is supplied AND
  //      `opts.skipFederation !== true` (option name kept for caller
  //      compat; it predates the Supabase-federation retirement). Without
  //      it, workspace-scoped reads (tickets, chat, calendar, …) silently
  //      stay scoped to the previous org's workspace.
  //   6. Emits `sdk.orgSwitched` on rootBus.
  //
  // Opts:
  //   skipPersist     — don't PATCH Mongo (use this in socket-echo paths
  //                     where another session already persisted).
  //   skipFederation  — don't run the active-workspace alignment hop
  //                     (legacy name kept for caller compat).
  //   homeWorkspaceId — the workspace id whose org is `newOrgId`. When
  //                     omitted, no workspace hop runs and Mongo-only
  //                     state advances.
  //
  // If `setActiveOrganization` throws, the whole switch aborts BEFORE
  // touching local context — Mongo's pre-write state is the source of
  // truth, and the UI must stay pointed at the previous org so a failed
  // server write doesn't leave the user looking at a context that
  // server-side reads will reject.
  async switchOrg(newOrgId, opts = {}) {
    if (!newOrgId) throw new Error('[sdk.switchOrg] newOrgId is required')
    const previousOrgId = this._context.activeOrgId
    if (previousOrgId === newOrgId) return { changed: false, orgId: newOrgId }
    const {
      skipPersist = false,
      skipFederation = false,
      homeWorkspaceId = null
    } = opts

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
      try {
        this._tokenManager.invalidateClaims()
      } catch {}
    }

    // 4. Walk per-service switchOrg hooks. Services that don't implement
    //    the hook are silently skipped (additive surface).
    const switchPromises = []
    for (const [name, service] of this._services.entries()) {
      if (typeof service.switchOrg === 'function') {
        switchPromises.push(
          Promise.resolve(service.switchOrg(newOrgId, previousOrgId)).catch(
            (err) => {
              logger.error(
                `[sdk.switchOrg] Service '${name}' switchOrg failed:`,
                err
              )
            }
          )
        )
      }
    }
    await Promise.all(switchPromises)

    // 5. Align the active workspace to the org's home workspace so
    //    workspace-scoped reads re-scope. Errors here don't abort: Mongo is
    //    already updated and the SDK-side context advanced; the hop is
    //    recoverable and shouldn't roll back the org switch.
    let federationResult = null
    if (
      !skipFederation &&
      homeWorkspaceId &&
      typeof this.switchWorkspace === 'function'
    ) {
      try {
        federationResult = await this.switchWorkspace(homeWorkspaceId)
      } catch (err) {
        logger.warn(
          '[sdk.switchOrg] switchWorkspace hop failed:',
          err?.message || err
        )
      }
    }

    // 6. Emit on rootBus so external consumers (fetch plugin's queryClient,
    //    shell state managers, workspace's onWorkspaceChange pipeline)
    //    react and clear their own caches.
    this.rootBus?.emit?.('sdk.orgSwitched', {
      previousOrgId,
      newOrgId,
      persist: persistResult,
      federation: federationResult
    })

    return {
      changed: true,
      previousOrgId,
      newOrgId,
      persist: persistResult,
      federation: federationResult
    }
  }

  // Switch the active workspace within the current org. `setActiveWorkspace`
  // writes the new active workspace to Mongo — the source of truth the
  // workspace-project `userResolver` reads to scope the tenant. The old
  // federated JWT re-mint (that stamped the `active_workspace_id` claim) is
  // retired/legacy; this method still fires it best-effort via the optional
  // `context.federationSwitchWorkspace` callback registered at init time.
  //
  // Frontend contract:
  //   await sdk.switchWorkspace(workspaceId)
  // — single entry point. Mongo persist, state cleanup, event emission, and
  // localStorage persistence are all SDK-internal.
  //
  // Returns the switch result so the caller can decide on UI feedback
  // (e.g. dismiss a transition overlay only on { ok: true }).
  async switchWorkspace(newWorkspaceId) {
    if (!newWorkspaceId)
      throw new Error('[sdk.switchWorkspace] workspaceId is required')
    const previousWorkspaceId = this._context.activeWorkspaceId
    if (previousWorkspaceId === newWorkspaceId) {
      return { ok: true, changed: false, workspaceId: newWorkspaceId }
    }

    // Mongo-native switch (mirrors switchOrg's setActiveOrganization persist):
    // write the active workspace to Mongo FIRST — that's the source of truth
    // the workspace-project `userResolver` reads. If the Mongo write fails,
    // that's a genuine failure → surface it (throws to the caller).
    if (typeof this.setActiveWorkspace === 'function') {
      await this.setActiveWorkspace(newWorkspaceId)
    }

    this.updateContext({ activeWorkspaceId: newWorkspaceId })

    if (this._tokenManager?.invalidateClaims) {
      try {
        this._tokenManager.invalidateClaims()
      } catch {}
    }

    // Walk services; per-service switchWorkspace hooks get notified.
    const switchPromises = []
    for (const [name, service] of this._services.entries()) {
      if (typeof service.switchWorkspace === 'function') {
        switchPromises.push(
          Promise.resolve(
            service.switchWorkspace(newWorkspaceId, previousWorkspaceId)
          ).catch((err) => {
            logger.error(
              `[sdk.switchWorkspace] Service '${name}' switchWorkspace failed:`,
              err
            )
          })
        )
      }
    }
    await Promise.all(switchPromises)

    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      try {
        globalThis.localStorage.setItem('activeWorkspace', newWorkspaceId)
      } catch {}
    }

    // The federated JWT re-mint is now OPTIONAL/legacy enrichment — fire it
    // best-effort (mirrors switchOrg) so any lingering federation callback can
    // refresh its `active_workspace_id` in the background, but NEVER let a
    // federation hiccup (CORS / cold endpoint / no callback registered) abort
    // the switch. This is the detach: Mongo is authoritative; the callback is a
    // chainable adapter. (Previously this fetch was the blocking critical path
    // that surfaced "Failed to fetch".)
    let federationResult = { ok: true, skipped: true }
    const federationFn = this._context.federationSwitchWorkspace
    if (typeof federationFn === 'function') {
      federationResult = { ok: true, pending: true }
      Promise.resolve()
        .then(() => federationFn(newWorkspaceId))
        .then((res) => {
          if (res && res.ok === false) {
            logger.warn(
              '[sdk.switchWorkspace] federation refresh failed (non-fatal):',
              res?.error?.message || res?.error
            )
          }
        })
        .catch((err) => {
          logger.warn(
            '[sdk.switchWorkspace] federation refresh error (non-fatal):',
            err?.message || err
          )
        })
    }

    this.rootBus?.emit?.('sdk.workspaceSwitched', {
      previousWorkspaceId,
      newWorkspaceId
    })

    return {
      ok: true,
      changed: true,
      previousWorkspaceId,
      newWorkspaceId,
      federation: federationResult
    }
  }

  // Check if SDK is ready
  isReady() {
    const sdkServices = Array.from(this._services.values())
    return (
      sdkServices.length > 0 &&
      sdkServices.every((service) => service.isReady())
    )
  }

  // Get SDK status
  getStatus() {
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
  _createServiceProxies() {
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
  async destroy() {
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
  createDocService,
  createResourceLinkService,
  createTicketService,
  createAnalyzedService,
  createProposedActionService,
  createWorkflowService,
  createFieldDefService,
  createRecordCollectionService,
  createPartyService,
  createInteractionService,
  createSegmentService,
  createProductService,
  createPriceService,
  createCompanyProfileService,
  createAgreementService,
  createInvoiceService,
  createTransactionService,
  createCommentService,
  createAttachmentService,
  createWatcherService,
  createActivityEntryService,
  createTagService,
  createBookingService,
  createAvailabilityRuleService,
  createConversationService,
  createRecurrenceService,
  createAllocationRuleService,
  createSharedAssetService,
  createCreditsService,
  createCanvasLayoutService,
  createMeetService,
  createCalendarService,
  createBuildsService,
  workspaceProjectBaseUrl
} from './services/index.js'

// Re-export entity dispatcher helpers so external packages (e.g. plugins
// extending the fetch adapter) can add their own routes at boot.
export {
  registerEntity,
  createEntityDispatcher
} from './services/EntityDispatcher.js'

// Re-export BaseService so opt-in extension packages (e.g.
// @symbo.ls/sdk-financials) can subclass it without depending on the
// SDK's internal path layout.
export { BaseService } from './services/BaseService.js'

// Export environment configuration
export { default as environment } from './config/environment.js'
