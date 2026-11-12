// The SDK class. `src/index.js` (the full entry) and `src/lazy.js` (the entry
// without the static service factories) both export it.
//
// Services come from services/registry.js. By default initialize() builds
// every one of them, as it always has. With `lazyServices: true` it builds
// only the core services; every other service loads on its first call — see
// loadService() and the registry header.
import { SERVICE_REGISTRY, SYNC_HANDLE_METHODS } from './services/registry.js'
import { SERVICE_METHODS } from './utils/services.js'
import environment from './config/environment.js'
import { rootBus } from './state/rootEventBus.js'
import { logger, setDebug } from './utils/logger.js'
import { getTokenManager } from './utils/TokenManager.js'
import { createEntityDispatcher } from './services/EntityDispatcher.js'
import {
  deferredHandle,
  unknownServiceError,
  notInitializedError,
  destroyedError,
  loadFailedError
} from './utils/lazyServices.js'

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
  /**
   * @param {object} [options]
   * @param {boolean} [options.lazyServices=false]  build only the core
   *   services in initialize(); every other service loads on its first call.
   *   In this mode `getService(name)` answers the instance once it is
   *   loaded and a Promise of it before — await it.
   * @param {string[]} [options.preloadServices]  lazy mode only: services
   *   initialize() also builds (and waits for), so a caller that reads them
   *   synchronously after init still can.
   * @param {object} [options.serviceRegistry]  replaces services/registry.js
   *   (tests; extension packages). Not passed on to the services.
   */
  constructor(options = {}) {
    const { serviceRegistry, ...serviceOptions } = options || {}
    this._services = new Map()
    this._context = {}
    this._options = this._validateOptions(serviceOptions)
    this._registry = serviceRegistry || SERVICE_REGISTRY
    // In-flight service builds by name: concurrent first calls share one
    // load; a failed load is dropped so the next call tries again.
    this._loading = new Map()
    // Set by initialize(); a lazy load before it is a caller error.
    this._initPromise = null
    // Bumped by destroy(): a load that started before it never registers.
    this._generation = 0

    // Real accessor for the shared TokenManager singleton (see
    // utils/TokenManager.js). Every BaseService gets the same instance via
    // getTokenManager() in its own init() — this stayed null on the SDK
    // root because nothing ever assigned it here, so `sdk._tokenManager`
    // read undefined in every build even though
    // `sdk.getService('auth')._tokenManager` worked. Assigned for real once
    // a service has initialized it (end of initialize(), below) so the
    // root never races ahead with apiUrl-less defaults from an early first
    // call.
    this._tokenManager = null

    // `tokenStorage` ('localStorage' | 'sessionStorage' | 'memory') picks where
    // the shared TokenManager keeps the session. A surface that must never
    // persist one — a preview origin renders user project code — passes
    // 'memory'. The TokenManager is a page-wide singleton created by the FIRST
    // caller, so it is created here, before any service initializes; a page
    // that already holds one keeps it (and says so).
    if (this._options.tokenStorage) {
      const tm = getTokenManager({
        apiUrl: this._options.apiUrl,
        storageType: this._options.tokenStorage
      })
      if (tm.config.storageType !== this._options.tokenStorage) {
        logger.warn(
          `[SDK] tokenStorage "${this._options.tokenStorage}" ignored: this page's TokenManager already uses "${tm.config.storageType}"`
        )
      }
    }

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
    // `reacquireSession` is a TokenManager hook, not service context — keep
    // it out of `_context` (see TokenManager.setSessionReacquirer).
    const { reacquireSession, ...serviceContext } = context || {}
    this._context = {
      ...this._context,
      ...serviceContext
    }

    // The context is merged above, before any service is built, so a lazy
    // service built later gets the same context an eager one gets. Each
    // service's own comment lives in services/index.js.
    const run = this._initializeServices(reacquireSession)
    this._initPromise = run
    return run
  }

  // The names initialize() builds: every service by default; in lazy mode
  // the core, the preloads, and whatever an earlier run already loaded (a
  // second initialize() rebuilds what is there, as it always did).
  _initialServiceNames() {
    if (!this._isLazyMode()) return [...Object.keys(this._registry)]
    const wanted = new Set([
      ...Object.keys(this._registry).filter((n) => this._registry[n].core === true),
      ...(Array.isArray(this._options.preloadServices) ? this._options.preloadServices : []),
      ...this._services.keys()
    ])
    for (const name of wanted) {
      if (!this._registry[name]) throw unknownServiceError(name)
    }
    // Registry order, so the build order is the same in both modes.
    return Object.keys(this._registry).filter((n) => wanted.has(n))
  }

  async _initializeServices(reacquireSession) {
    const names = this._initialServiceNames()
    const run = (async () => {
      // Load every class first, then build them all in one synchronous pass —
      // the order and timing initialize() always had (each _initService call
      // writes `_context.services` before its first await).
      const classes = await Promise.all(names.map((name) => this._loadServiceClass(name)))
      await Promise.all(
        names.map((name, i) =>
          this._initService(
            name,
            new classes[i]({
              context: this._context,
              options: this._options
            })
          )
        )
      )
    })()
    // A loadService() for one of these names during the build waits for it
    // instead of making a second instance.
    for (const name of names) {
      this._trackLoad(name, run.then(() => this._services.get(name)))
    }
    await run

    // Every service above just called getTokenManager() in its own init()
    // (see BaseService.js), creating the shared singleton with the real
    // apiUrl. Adopt that same instance on the root now that it exists.
    this._tokenManager = getTokenManager()
    // An origin whose session came from a sibling origin (access token only,
    // no refresh token) asks that sibling again instead of signing out.
    if (typeof reacquireSession === 'function') {
      this._tokenManager.setSessionReacquirer(reacquireSession)
    }

    return this
  }

  _isLazyMode() {
    return this._options.lazyServices === true
  }

  // A registry entry's class. Core entries answer at once; lazy entries run
  // their `import()`. A rejected import becomes SDK_SERVICE_LOAD_FAILED.
  async _loadServiceClass(name) {
    const entry = this._registry[name]
    if (!entry) throw unknownServiceError(name)
    try {
      const ServiceClass = await entry.load()
      if (typeof ServiceClass !== 'function') {
        throw new Error(`the module has no export '${entry.className}'`)
      }
      return ServiceClass
    } catch (err) {
      throw loadFailedError(name, err)
    }
  }

  // Remember an in-flight build; forget it when it settles, so a failed
  // load is tried again on the next call (no poisoned cache).
  _trackLoad(name, pending) {
    this._loading.set(name, pending)
    const forget = () => {
      if (this._loading.get(name) === pending) this._loading.delete(name)
    }
    pending.then(forget, forget)
    return pending
  }

  /**
   * The service `name`, built on first use. Always a Promise.
   *
   * - Loaded already: resolves to that instance.
   * - Concurrent first calls share one load.
   * - The service gets `_context` as it is when it is built, and a context
   *   update made while it was loading is applied to it before it resolves.
   * - A failed load rejects with `code: 'SDK_SERVICE_LOAD_FAILED'` and is
   *   tried again on the next call.
   * - Before initialize(): rejects with `code: 'SDK_NOT_INITIALIZED'`.
   *
   * @param {string} name  a key of services/registry.js
   * @returns {Promise<object>}
   */
  loadService(name) {
    const loaded = this._services.get(name)
    if (loaded) return Promise.resolve(loaded)
    if (!this._registry[name]) return Promise.reject(unknownServiceError(name))
    if (!this._initPromise) return Promise.reject(notInitializedError(name))
    const pending = this._loading.get(name)
    if (pending) return pending
    return this._trackLoad(name, this._buildService(name))
  }

  async _buildService(name) {
    const generation = this._generation
    const ServiceClass = await this._loadServiceClass(name)
    if (generation !== this._generation) throw destroyedError(name)
    // initialize() may have built it while the chunk was loading.
    const existing = this._services.get(name)
    if (existing) return existing
    const context = this._context
    const service = new ServiceClass({ context, options: this._options })
    try {
      await this._initService(name, service)
    } catch (err) {
      this._forgetContextService(name, service)
      throw err
    }
    if (generation !== this._generation) {
      // Dropped, not destroyed: BaseService.destroy() also destroys the
      // page-wide TokenManager, which destroy() already handled.
      this._services.delete(name)
      this._forgetContextService(name, service)
      throw destroyedError(name)
    }
    // updateContext() replaces `_context`; a service built from the old
    // object gets the newer values the same way loaded services got them.
    if (this._context !== context) service.updateContext(this._context)
    return service
  }

  _forgetContextService(name, service) {
    const services = this._context.services
    if (services && services[name] === service) {
      const rest = { ...services }
      delete rest[name]
      this._context.services = rest
    }
  }

  // A lazy service that is not loaded yet, in lazy mode, after initialize().
  _isPendingLazyService(name) {
    return (
      this._isLazyMode() &&
      this._initPromise !== null &&
      !this._services.has(name) &&
      Boolean(this._registry[name]) &&
      this._registry[name].core !== true
    )
  }

  /**
   * Adopt a session this page received from elsewhere (e.g. a sign-in
   * handoff fragment) into the TokenManager, in whatever storage the SDK was
   * created with — memory for `tokenStorage: 'memory'`. Returns true when a
   * token was adopted.
   *
   * @param {{ accessToken: string, refreshToken?: string, expiresAt?: number, expiresIn?: number }} tokens
   */
  adoptTokens ({ accessToken, refreshToken, expiresAt, expiresIn } = {}) {
    if (!accessToken) return false
    const tm =
      this._tokenManager ||
      getTokenManager({
        apiUrl: this._options.apiUrl,
        ...(this._options.tokenStorage ? { storageType: this._options.tokenStorage } : {})
      })
    let seconds = Number(expiresIn) || 0
    if (!seconds && Number(expiresAt) > Date.now()) {
      seconds = Math.round((Number(expiresAt) - Date.now()) / 1000)
    }
    tm.setTokens({
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      ...(seconds ? { expires_in: seconds } : {})
    })
    return true
  }

  // Private helper to initialize a service
  async _initService(name, service) {
    // Add service reference to context for inter-service communication
    this._context.services = {
      ...this._context.services,
      [name]: service
    }
    // A sibling that is not loaded yet is one call away (BaseService._sibling).
    service._loadSibling = (siblingName) => this.loadService(siblingName)

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

  // Get service instance. Synchronous for every loaded service, as always.
  // Lazy mode only: a lazy service that is not loaded yet answers a Promise
  // of the instance (and starts its load) — callers await it.
  getService(name) {
    if (this._services.has(name)) return this._services.get(name)
    if (this._isPendingLazyService(name)) return this.loadService(name)
    throw unknownServiceError(name)
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
  //   3. Walks per-service `switchOrg(newOrgId, previousOrgId)` hooks —
  //      this is where the only real cross-switch credential cache is
  //      dropped (see the NO CLAIM CACHE note below).
  //   4. Aligns the ACTIVE WORKSPACE to the new org's home workspace via
  //      `switchWorkspace`, IF `opts.homeWorkspaceId` is supplied AND
  //      `opts.skipWorkspaceHop !== true`. Without it, workspace-scoped
  //      reads (tickets, chat, calendar, …) silently stay scoped to the
  //      previous org's workspace.
  //   5. Emits `sdk.orgSwitched` on rootBus.
  //
  // NO CLAIM CACHE — do not re-add a `_tokenManager.invalidateClaims()`
  // step here (SDK-INVALIDATECLAIMS-DEAD-GUARD-1). Both switch paths used
  // to guard on that method; `TokenManager` never defined it, so the guard
  // was falsy in every build and the call never ran. There is nothing for
  // it to clear: `TokenManager` holds only `tokens` + `_personaToken`, and
  // EVERY claim reader re-decodes the live access token per call —
  // `TokenManager._decodeJwtExpMs`, `PersonaService._decodeAccessTokenClaims`,
  // `AuthService._userFromTokenClaims`, `WorkspaceProjectService.
  // _decodeJwtWorkspaceId`. None memoizes. The one credential cache that
  // CAN outlive a switch is the workspace-project token provider's, and
  // `WorkspaceProjectService.switchOrg/switchWorkspace` already drop it
  // via the step-3 hook walk. The access token's OWN `activeOrganization`
  // claim can still lag a switch (nothing client-side re-mints it since
  // the Supabase federation retirement, 2026-07-03) — that is handled by
  // explicit `orgId`/`workspaceId` scoping on the wire plus server-side
  // resolution from Mongo, never by clearing a client cache.
  //
  // Opts:
  //   skipPersist      — don't PATCH Mongo (use this in socket-echo paths
  //                      where another session already persisted).
  //   skipWorkspaceHop — don't run the active-workspace alignment hop
  //                      (renamed 2026-07-31 from the legacy
  //                      `skipFederation`; the hop is a pure Mongo
  //                      `switchWorkspace` call now that the Supabase
  //                      federation re-mint it used to also trigger is
  //                      deleted — nothing in the monorepo passed the old
  //                      name).
  //   homeWorkspaceId  — the workspace id whose org is `newOrgId`. When
  //                      omitted, no workspace hop runs and Mongo-only
  //                      state advances.
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
      skipWorkspaceHop = false,
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

    // 3. Walk per-service switchOrg hooks. Services that don't implement
    //    the hook are silently skipped (additive surface). This is also the
    //    step that drops the workspace-project token-provider cache — see
    //    the NO CLAIM CACHE note on this method.
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

    // 4. Align the active workspace to the org's home workspace so
    //    workspace-scoped reads re-scope. Errors here don't abort: Mongo is
    //    already updated and the SDK-side context advanced; the hop is
    //    recoverable and shouldn't roll back the org switch.
    let workspaceHopResult = null
    if (
      !skipWorkspaceHop &&
      homeWorkspaceId &&
      typeof this.switchWorkspace === 'function'
    ) {
      try {
        workspaceHopResult = await this.switchWorkspace(homeWorkspaceId)
      } catch (err) {
        logger.warn(
          '[sdk.switchOrg] switchWorkspace hop failed:',
          err?.message || err
        )
      }
    }

    // 5. Emit on rootBus so external consumers (fetch plugin's queryClient,
    //    shell state managers, workspace's onWorkspaceChange pipeline)
    //    react and clear their own caches.
    this.rootBus?.emit?.('sdk.orgSwitched', {
      previousOrgId,
      newOrgId,
      persist: persistResult,
      workspaceHop: workspaceHopResult
    })

    return {
      changed: true,
      previousOrgId,
      newOrgId,
      persist: persistResult,
      workspaceHop: workspaceHopResult
    }
  }

  // Switch the active workspace within the current org. `setActiveWorkspace`
  // writes the new active workspace to Mongo — the source of truth the
  // workspace-project `userResolver` reads to scope the tenant. The old
  // federated JWT re-mint (that used to stamp the `active_workspace_id`
  // claim via the Supabase auth-bridge) was retired with the Mongo cutover
  // (2026-07-03) and deleted for good along with `@symbo.ls/sdk-bridge`
  // (2026-07-31) — Mongo is now the sole source of truth, no best-effort
  // federation callback fires here any more.
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

    // No claim cache to invalidate here either — see the NO CLAIM CACHE
    // note on switchOrg (SDK-INVALIDATECLAIMS-DEAD-GUARD-1). The service
    // hook walk below is what drops the one cache that can go stale.
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

    this.rootBus?.emit?.('sdk.workspaceSwitched', {
      previousWorkspaceId,
      newWorkspaceId
    })

    return {
      ok: true,
      changed: true,
      previousWorkspaceId,
      newWorkspaceId
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

  // Composite boot — explicit method so it takes precedence over the
  // SERVICE_METHODS proxy (the generation loop skips names already on the
  // SDK). boot IS the getMe of the one-round-trip path: its `me` section
  // replays /auth/me verbatim, so hydrate the auth session user exactly
  // like getMe() would. Without this, a boot-only client keeps
  // getSession().user null and every auth-state tick reads as signed-out —
  // consumers that seeded identity from the boot payload then watched the
  // first tick wipe it (the empty-chrome boot). adoptSessionUser also
  // re-emits USER_UPDATED so subscribers registered before boot resolved
  // receive a corrective session-with-user tick.
  async boot(opts) {
    const res = await this.getService('boot').boot(opts)
    try {
      const user = res?.data?.me?.user || null
      if (user) this.getService('auth')?.adoptSessionUser?.(user)
    } catch (_) {
      // Hydration is best-effort — the boot payload itself is the caller's
      // source of truth; getSession()'s claims fallback covers the rest.
    }
    return res
  }

  // Create proxy methods for direct service access
  _createServiceProxies() {
    for (const [methodName, serviceName] of Object.entries(SERVICE_METHODS)) {
      // Skip if method already exists on SDK
      if (!this[methodName]) {
        // Create proxy method
        this[methodName] = (...args) => {
          // Lazy mode, service not loaded yet: load it, then call. A
          // subscribe-style method still answers its stop handle at once.
          if (this._isPendingLazyService(serviceName)) {
            const pending = this.loadService(serviceName).then((service) => {
              if (!service[methodName]) {
                throw new Error(
                  `Method '${methodName}' not found on service '${serviceName}'`
                )
              }
              return service[methodName](...args)
            })
            return SYNC_HANDLE_METHODS.has(methodName)
              ? deferredHandle(pending, methodName)
              : pending
          }
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
    // A lazy load still in flight must not register into the cleared SDK.
    this._generation++
    this._loading.clear()
    this._initPromise = null
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
