import test from 'tape'
import { SERVICE_METHODS } from '../../../utils/services.js'
import {
  AuthService,
  CollabService,
  DocService,
  ProjectService,
  PlanService,
  SubscriptionService,
  FileService,
  PaymentService,
  DnsService,
  BranchService,
  PullRequestService,
  AdminService,
  ScreenshotService,
  TrackingService,
  WaitlistService,
  MetricsService,
  IntegrationService,
  FeatureFlagService,
  OrganizationService,
  WorkspaceService,
  WorkspaceProjectService,
  TicketService,
  AllocationRuleService,
  SharedAssetService,
  CreditsService,
  CanvasLayoutService
} from '../../index.js'

// service-name → ServiceClass — the same wiring `_initService` does in
// `sdk/src/index.js`. If a new service is registered there, add it here
// too. The audit will tell you exactly what's missing if you forget.
const SERVICES = {
  auth: AuthService,
  collab: CollabService,
  docs: DocService,
  project: ProjectService,
  plan: PlanService,
  subscription: SubscriptionService,
  file: FileService,
  payment: PaymentService,
  dns: DnsService,
  branch: BranchService,
  pullRequest: PullRequestService,
  admin: AdminService,
  screenshot: ScreenshotService,
  tracking: TrackingService,
  waitlist: WaitlistService,
  metrics: MetricsService,
  integration: IntegrationService,
  featureFlag: FeatureFlagService,
  organization: OrganizationService,
  workspace: WorkspaceService,
  workspaceProject: WorkspaceProjectService,
  tickets: TicketService,
  allocationRule: AllocationRuleService,
  sharedAsset: SharedAssetService,
  credits: CreditsService,
  canvasLayout: CanvasLayoutService
}

// Methods that intentionally exist on a service but are NOT flat-exposed via
// SERVICE_METHODS. Keep this allowlist small and explicit. If a method
// belongs here:
//   - it's a helper meant to be called via sdk.getService('x').method() OR
//   - it's an internal hook that just happens to be public for testing OR
//   - it's a typed dispatcher route that's only reachable via sdk.execute().
// Anything else SHOULD be in SERVICE_METHODS — that's the whole point of
// this audit.
const INTENTIONALLY_NOT_FLAT_EXPOSED = new Set([
  // BaseService lifecycle — every service inherits these; flat-exposing them
  // would shadow the SDK-level methods of the same name OR is meant to be
  // accessed via `sdk.getService('x').isReady()` rather than `sdk.isReady()`.
  'init',
  'destroy',
  'getStatus',
  'updateContext',
  'setApiUrl',
  'setOptions',
  'isReady',
  // WorkspaceProjectService dispatches everything through `_sb`/`_ws`
  // helpers; its public surface is reachable via sdk.execute('workspaceProject.*', ...)
  // rather than flat methods. Flat-exposing every workspace-project method
  // would double the SDK surface area and conflict with same-name methods
  // on other services (e.g. `chat`, `calendar`).
  'WorkspaceProjectService:*',
  // TicketService methods are accessed via sdk.tickets.* (sdk.getService('tickets').list()
  // etc.), NOT as top-level flat proxy methods. Flat-exposing them would cause
  // collisions with same-name methods on other services (e.g. `list`, `get`,
  // `create`, `update`, `remove`, `assign`, `subscribe`).
  'TicketService:*',
  // DocService methods are accessed via sdk.docs.* (sdk.getService('docs').list()
  // etc.), NOT as top-level flat proxy methods. Flat-exposing them would cause
  // collisions with same-name methods on other services (e.g. `list`, `get`,
  // `create`, `update`, `remove`, `subscribe`, `tree`, `folders`).
  'DocService:*'
])

// Pre-existing drift captured 2026-05-18 when this audit first ran. Each
// entry is a `ServiceClassName:methodName` pair that EXISTS on the class
// but is NOT currently in SERVICE_METHODS. They fall into a few buckets:
//   - validation wrappers (`*WithValidation`, `validate*`) — debatably
//     useful at the flat surface; left out historically.
//   - granular workspace/project/credit methods recently added without a
//     SERVICE_METHODS update — these ARE bugs by the ticket's definition.
//   - helpers exposed for tests or for inter-service calls only.
//
// The audit catches any NEW drift the moment it lands. Entries should be
// removed from this list one of three ways:
//   1. Add the method to SERVICE_METHODS (it deserves flat exposure).
//   2. Move it to INTENTIONALLY_NOT_FLAT_EXPOSED (it shouldn't be flat).
//   3. Prefix it with `_` (it shouldn't be public at all).
// See ticket SDK-SERVICE-METHODS-REGISTRY-DRIFT for the rationale.
const PRE_EXISTING_DRIFT = new Set([
  'AdminService:getProjectKeyStats',
  'AuthService:listMembers',
  'AuthService:canPerformOperation',
  'AuthService:checkProjectFeature',
  'AuthService:checkProjectPermission',
  'AuthService:clearProjectRoleCache',
  'AuthService:getCurrentUser',
  'AuthService:getMyProjectRole',
  'AuthService:hasValidTokens',
  'AuthService:isAuthenticated',
  'AuthService:loginWithValidation',
  'AuthService:registerWithValidation',
  'AuthService:setPluginSession',
  'AuthService:validateRegistrationData',
  'AuthService:withPermission',
  'CollabService:canRedo',
  'CollabService:canUndo',
  'CollabService:clearUndoHistory',
  'CollabService:getConnectionInfo',
  'CollabService:getRedoStackSize',
  'CollabService:getUndoStackSize',
  'CreditsService:getProjectBalance',
  'CreditsService:getProjectLedger',
  'CreditsService:getProjectSpendControls',
  'CreditsService:topupProjectCredits',
  'CreditsService:updateProjectSpendControls',
  'FileService:deleteFile',
  'FileService:getFile',
  'FileService:listMyUploads',
  'FileService:updateFile',
  'FileService:uploadMarketplaceThumbnail',
  'FileService:uploadMultipleProjectFiles',
  'FileService:uploadProjectFile',
  'MetricsService:getProjectUsage',
  'OrganizationService:adminListAllTeams',
  'OrganizationService:adminOverrideTeam',
  'OrganizationService:createOrgRole',
  'OrganizationService:deleteOrgRole',
  'OrganizationService:ensureOrgStripeCustomer',
  'OrganizationService:getMemberEffectiveRole',
  'OrganizationService:grantTeamWorkspaceAccess',
  'OrganizationService:listOrgPayments',
  'OrganizationService:listOrgRoles',
  'OrganizationService:listTeamWorkspaceAccess',
  'OrganizationService:revokeTeamWorkspaceAccess',
  'OrganizationService:updateOrgRole',
  'OrganizationService:updateTeamWorkspaceAccess',
  // PaymentService.hasActiveSubscription is mapped to 'subscription' in
  // SERVICE_METHODS — it lives on both services but the subscription one
  // wins at the flat surface. The PaymentService copy is reachable via
  // sdk.getService('payment').hasActiveSubscription().
  'PaymentService:hasActiveSubscription',
  'ProjectService:assignProjectOwner',
  'ProjectService:autoAssignProjectOwners',
  'ProjectService:getProjectComponents',
  'ProjectService:getProjectComponentsByKey',
  'ProjectService:getProjectFunctions',
  'ProjectService:getProjectFunctionsByKey',
  'ProjectService:getProjectPages',
  'ProjectService:getProjectPagesByKey',
  'ProjectService:listProjectOwnership',
  'ProjectService:resolveAppkey',
  'ScreenshotService:refreshForEnvironment',
  'SubscriptionService:canAccessProjectFeature',
  'SubscriptionService:getPricingOptions',
  'SubscriptionService:grantProjectFeature',
  'SubscriptionService:revokeProjectFeature',
  'TrackingService:configure',
  'TrackingService:flush'
])

const _classPublicMethodNames = (ServiceClass) => {
  const names = new Set()
  let proto = ServiceClass.prototype
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue
      if (name.startsWith('_')) continue
      const desc = Object.getOwnPropertyDescriptor(proto, name)
      // Skip getters/setters — they're property accessors, not callable
      // methods that consumers would invoke via sdk.X().
      if (desc && (desc.get || desc.set)) continue
      if (typeof desc?.value !== 'function') continue
      names.add(name)
    }
    proto = Object.getPrototypeOf(proto)
  }
  return names
}

const _isAllowlisted = (serviceClassName, method) => {
  if (INTENTIONALLY_NOT_FLAT_EXPOSED.has(method)) return true
  if (INTENTIONALLY_NOT_FLAT_EXPOSED.has(`${serviceClassName}:*`)) return true
  if (INTENTIONALLY_NOT_FLAT_EXPOSED.has(`${serviceClassName}:${method}`)) return true
  if (PRE_EXISTING_DRIFT.has(`${serviceClassName}:${method}`)) return true
  return false
}

test('SERVICE_METHODS audit — every public service method is flat-exposed (or allowlisted)', t => {
  const drift = []
  for (const [serviceName, ServiceClass] of Object.entries(SERVICES)) {
    const className = ServiceClass.name
    const methods = _classPublicMethodNames(ServiceClass)
    for (const method of methods) {
      if (_isAllowlisted(className, method)) continue
      const mappedService = SERVICE_METHODS[method]
      if (mappedService !== serviceName) {
        drift.push({
          service: serviceName,
          class: className,
          method,
          currentMapping: mappedService || '<missing>'
        })
      }
    }
  }
  if (drift.length > 0) {
    const lines = drift.map(d =>
      `  - ${d.class}.${d.method}() is not registered in SERVICE_METHODS (or maps to '${d.currentMapping}' instead of '${d.service}'). ` +
      `Add \`${d.method}: '${d.service}',\` to sdk/src/utils/services.js, ` +
      `OR prefix the method with '_' if it shouldn't be flat-exposed, ` +
      `OR add an entry to INTENTIONALLY_NOT_FLAT_EXPOSED in this test.`
    )
    t.fail(`SERVICE_METHODS is missing ${drift.length} flat-exposed method(s):\n${lines.join('\n')}`)
  } else {
    t.pass(`SERVICE_METHODS covers every public method across ${Object.keys(SERVICES).length} services`)
  }
  t.end()
})

test('SERVICE_METHODS audit — every map entry resolves to a real method on the named service', t => {
  const orphans = []
  for (const [method, serviceName] of Object.entries(SERVICE_METHODS)) {
    const ServiceClass = SERVICES[serviceName]
    if (!ServiceClass) {
      orphans.push({ method, serviceName, reason: 'unknown service name' })
      continue
    }
    const methods = _classPublicMethodNames(ServiceClass)
    if (!methods.has(method)) {
      orphans.push({ method, serviceName, reason: `${ServiceClass.name} has no public method named '${method}'` })
    }
  }
  if (orphans.length > 0) {
    const lines = orphans.map(o => `  - SERVICE_METHODS['${o.method}'] → '${o.serviceName}': ${o.reason}`)
    t.fail(`SERVICE_METHODS has ${orphans.length} orphan entry/entries:\n${lines.join('\n')}`)
  } else {
    t.pass(`Every SERVICE_METHODS entry (${Object.keys(SERVICE_METHODS).length} total) resolves to a real method`)
  }
  t.end()
})
