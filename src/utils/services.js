export const SERVICE_METHODS = {
  hasPermission: 'auth',
  hasGlobalPermission: 'auth',

  // Collab service methods
  connect: 'collab',
  disconnect: 'collab',
  isConnected: 'collab',
  updateData: 'collab',
  addItem: 'collab',
  addMultipleItems: 'collab',
  updateItem: 'collab',
  deleteItem: 'collab',
  undo: 'collab',
  redo: 'collab',
  checkpoint: 'collab',

  // Realtime collaboration helper methods
  sendCursor: 'collab',
  sendPresence: 'collab',
  toggleLive: 'collab',

  // Core service methods (new - replaces most based/auth functionality)
  // Auth methods
  getStoredAuthState: 'auth',
  getAuthToken: 'auth',
  register: 'auth',
  login: 'auth',
  startDemo: 'auth',
  enterDemo: 'auth',
  claimDemoAccount: 'auth',
  cloneDemoWorkspace: 'auth',
  logout: 'auth',
  refreshToken: 'auth',
  googleAuth: 'auth',
  googleAuthCallback: 'auth',
  githubAuth: 'auth',
  // Native-shell OAuth deep-link redemption (tickets/ipad.md)
  exchangeNativeAuthToken: 'auth',
  requestPasswordReset: 'auth',
  confirmPasswordReset: 'auth',
  confirmRegistration: 'auth',
  requestPasswordChange: 'auth',
  confirmPasswordChange: 'auth',
  getMe: 'auth',
  updateMe: 'auth',
  getPermissions: 'auth',
  getSession: 'auth',
  onAuthStateChange: 'auth',
  getTokenDebugInfo: 'auth',

  getMyProjectRoleByKey: 'auth',
  getProjectRoleWithFallback: 'auth',
  getProjectRoleByKeyWithFallback: 'auth',

  // Cross-org notifications + projects + memberships (NEEDED_FOR_INTRANET §I8/§I9/§I10)
  getMyOrgNotifications: 'auth',
  getMyFreebusy: 'auth',
  getMyProjects: 'auth',
  getMyTeams: 'auth',
  getMyOrgMemberships: 'auth',
  getOrgMemberRoles: 'auth',
  setActiveOrganization: 'auth',
  setActiveWorkspace: 'auth',
  subscribeUserEvents: 'auth',
  subscribePresence: 'auth',
  resendVerification: 'auth',
  verifyEmail: 'auth',

  // User methods
  getUserProfile: 'auth',
  updateUserProfile: 'auth',
  // Target-scoped HR write (PATCH /core/users/:userId/hr-profile). Distinct
  // from the self-scoped `workspaceProject.userProfiles.update` entity — see
  // the method comment in AuthService for why an admin acting on another user
  // MUST come through here.
  updateUserHrProfile: 'auth',
  getUserProjects: 'auth',
  getUser: 'auth',
  getUserByEmail: 'auth',
  listAgents: 'auth',
  createAgent: 'auth',
  getAgent: 'auth',
  updateAgent: 'auth',
  getAgentToolCatalog: 'auth',

  // Project methods (moved to project service)
  createProject: 'project',
  getProjects: 'project',
  getProject: 'project',
  getProjectByKey: 'project',
  getProjectDataByKey: 'project',
  getPublicProjectDataByKey: 'project',
  getPublicProjectVisibility: 'project',
  unlockPublicProjectDataByKey: 'project',
  getPublicProject: 'project',
  listPublicProjects: 'project',
  listProjects: 'project',
  updateProject: 'project',
  updateProjectComponents: 'project',
  updateProjectSettings: 'project',
  updateProjectName: 'project',
  updateProjectPackage: 'project',
  duplicateProject: 'project',
  removeProject: 'project',
  transferProjectOwnership: 'project',
  checkProjectKeyAvailability: 'project',
  getProjectRolePermissionsConfig: 'project',
  updateProjectRolePermissionsConfig: 'project',
  listEnvironments: 'project',
  upsertEnvironment: 'project',
  updateEnvironment: 'project',
  publishToEnvironment: 'project',
  deleteEnvironment: 'project',
  promoteEnvironment: 'project',

  // Project member methods (moved to project service)
  getProjectMembers: 'project',
  inviteMember: 'project',
  acceptInvite: 'project',
  createMagicInviteLink: 'project',
  updateMemberRole: 'project',
  removeMember: 'project',

  // Project library methods (moved to project service)
  getAvailableLibraries: 'project',
  getProjectLibraries: 'project',
  addProjectLibraries: 'project',
  removeProjectLibraries: 'project',

  // Project data methods (moved to project service)
  applyProjectChanges: 'project',
  getProjectData: 'project',
  getProjectVersions: 'project',
  getProjectVersion: 'project',
  getLatestProjectVersion: 'project',
  getProjectVersionData: 'project',
  restoreProjectVersion: 'project',
  updateProjectItem: 'project',
  deleteProjectItem: 'project',
  setProjectValue: 'project',
  addProjectItems: 'project',
  getProjectItemByPath: 'project',
  setProjectAccess: 'project',
  setProjectVisibility: 'project',

  // Favorite project methods (moved to project service)
  getFavoriteProjects: 'project',
  addFavoriteProject: 'project',
  removeFavoriteProject: 'project',

  // Recent project methods (moved to project service)
  getRecentProjects: 'project',

  // Plan methods (moved to plan service)
  getPlans: 'plan',
  getPlan: 'plan',
  getAdminPlans: 'plan',
  createPlan: 'plan',
  updatePlan: 'plan',
  deletePlan: 'plan',
  initializePlans: 'plan',
  getPlansWithValidation: 'plan',
  getPlanWithValidation: 'plan',
  createPlanWithValidation: 'plan',
  updatePlanWithValidation: 'plan',
  getActivePlans: 'plan',
  getPlansByPriceRange: 'plan',
  getPlanByKey: 'plan',
  getPlansWithPricing: 'plan',

  // Subscription methods (moved to subscription service)
  createSubscription: 'subscription',
  getProjectStatus: 'subscription',
  getUsage: 'subscription',
  cancelSubscription: 'subscription',
  listInvoices: 'subscription',
  getPortalUrl: 'subscription',
  createSubscriptionWithValidation: 'subscription',
  hasActiveSubscription: 'subscription',
  getProjectSubscription: 'subscription',
  getProjectUsage: 'subscription',
  getInvoicesWithPagination: 'subscription',
  isSubscriptionActive: 'subscription',
  getSubscriptionLimits: 'subscription',
  changeSubscription: 'subscription',
  downgrade: 'subscription',
  changeSubscriptionWithValidation: 'subscription',
  downgradeWithValidation: 'subscription',

  // File methods (moved to file service)
  uploadFile: 'file',
  updateProjectIcon: 'file',
  uploadFileWithValidation: 'file',
  uploadImage: 'file',
  uploadDocument: 'file',
  getFileUrl: 'file',
  // Authenticated private-file read (GET /core/files/:id/download) — the
  // companion to getFileUrl, which serves only the PUBLIC route and 404s on
  // private uploads.
  downloadFileContent: 'file',
  validateFile: 'file',
  createFileFormData: 'file',
  uploadMultipleFiles: 'file',

  // Payment methods (Use subscription service instead)
  checkout: 'payment',
  getSubscriptionStatus: 'payment',
  checkoutWithValidation: 'payment',
  getSubscriptionStatusWithValidation: 'payment',
  getSubscriptionDetails: 'payment',
  checkoutForPlan: 'payment',
  checkoutForTeam: 'payment',
  validateSubscriptionStatus: 'payment',
  formatSubscriptionAmount: 'payment',
  getSubscriptionSummary: 'payment',

  // DNS methods (moved to dns service)
  createDnsRecord: 'dns',
  getDnsRecord: 'dns',
  removeDnsRecord: 'dns',
  getCustomHost: 'dns',
  addProjectCustomDomains: 'dns',
  addProjectCustomDomain: 'dns',
  validateDomain: 'dns',
  createDnsRecordWithValidation: 'dns',
  getDnsRecordWithValidation: 'dns',
  removeDnsRecordWithValidation: 'dns',
  addProjectCustomDomainsWithValidation: 'dns',
  isDomainAvailable: 'dns',
  getDomainStatus: 'dns',
  verifyDomainOwnership: 'dns',
  getProjectDomains: 'dns',
  removeProjectCustomDomain: 'dns',
  formatDomain: 'dns',
  extractDomainFromUrl: 'dns',

  // Branch Management methods (moved to branch service)
  listBranches: 'branch',
  createBranch: 'branch',
  deleteBranch: 'branch',
  renameBranch: 'branch',
  getBranchChanges: 'branch',
  mergeBranch: 'branch',
  resetBranch: 'branch',
  publishVersion: 'branch',
  createBranchWithValidation: 'branch',
  branchExists: 'branch',
  previewMerge: 'branch',
  commitMerge: 'branch',
  createFeatureBranch: 'branch',
  createHotfixBranch: 'branch',
  getBranchStatus: 'branch',
  deleteBranchSafely: 'branch',
  getBranchesWithStatus: 'branch',
  validateBranchName: 'branch',
  sanitizeBranchName: 'branch',

  // Pull Request methods (moved to pullRequest service)
  createPullRequest: 'pullRequest',
  listPullRequests: 'pullRequest',
  getPullRequest: 'pullRequest',
  reviewPullRequest: 'pullRequest',
  addPullRequestComment: 'pullRequest',
  mergePullRequest: 'pullRequest',
  getPullRequestDiff: 'pullRequest',
  createPullRequestWithValidation: 'pullRequest',
  approvePullRequest: 'pullRequest',
  requestPullRequestChanges: 'pullRequest',
  getOpenPullRequests: 'pullRequest',
  getClosedPullRequests: 'pullRequest',
  getMergedPullRequests: 'pullRequest',
  isPullRequestMergeable: 'pullRequest',
  getPullRequestStatusSummary: 'pullRequest',
  validatePullRequestData: 'pullRequest',
  validateReviewData: 'pullRequest',
  getPullRequestStats: 'pullRequest',
  closePullRequest: 'pullRequest',
  reopenPullRequest: 'pullRequest',

  // Admin methods (moved to admin service)
  getAdminUsers: 'admin',
  assignProjectsToUser: 'admin',
  updateUser: 'admin',
  searchAdminUsers: 'admin',
  getAdminUsersByEmails: 'admin',
  getAdminUsersByIds: 'admin',
  assignSpecificProjectsToUser: 'admin',
  assignAllProjectsToUser: 'admin',
  validateUserData: 'admin',
  updateUserWithValidation: 'admin',
  getUserStats: 'admin',
  bulkUpdateUsers: 'admin',
  getUsersByRole: 'admin',
  getUsersByStatus: 'admin',
  activateUser: 'admin',
  deactivateUser: 'admin',
  suspendUser: 'admin',
  promoteToAdmin: 'admin',
  demoteFromAdmin: 'admin',

  // Screenshot methods
  createScreenshotProject: 'screenshot',
  getProjectScreenshots: 'screenshot',
  reprocessProjectScreenshots: 'screenshot',
  recreateProjectScreenshots: 'screenshot',
  deleteProjectScreenshots: 'screenshot',
  getThumbnailCandidate: 'screenshot',
  updateProjectThumbnail: 'screenshot',
  getPageScreenshot: 'screenshot',
  getComponentScreenshot: 'screenshot',
  getScreenshotByKey: 'screenshot',
  getQueueStatistics: 'screenshot',
  refreshThumbnail: 'screenshot',

  // Tracking methods
  configureTracking: 'tracking',
  trackEvent: 'tracking',
  trackError: 'tracking',
  captureException: 'tracking',
  logMessage: 'tracking',
  logDebug: 'tracking',
  logInfo: 'tracking',
  logWarning: 'tracking',
  logWarn: 'tracking',
  logErrorMessage: 'tracking',
  logError: 'tracking',
  addBreadcrumb: 'tracking',
  trackMeasurement: 'tracking',
  trackView: 'tracking',
  setUser: 'tracking',
  clearUser: 'tracking',
  setSession: 'tracking',
  clearSession: 'tracking',
  setGlobalAttributes: 'tracking',
  setGlobalAttribute: 'tracking',
  removeGlobalAttribute: 'tracking',
  flushQueue: 'tracking',
  getClient: 'tracking',
  isEnabled: 'tracking',
  isInitialized: 'tracking',

  // Waitlist methods
  joinWaitlist: 'waitlist',
  listWaitlistEntries: 'waitlist',
  updateWaitlistEntry: 'waitlist',
  inviteWaitlistEntry: 'waitlist',

  // Metrics methods
  getContributions: 'metrics',

  // Integration methods
  integrationWhoami: 'integration',
  listIntegrations: 'integration',
  createIntegration: 'integration',
  updateIntegration: 'integration',
  createIntegrationApiKey: 'integration',
  listIntegrationApiKeys: 'integration',
  revokeIntegrationApiKey: 'integration',
  createIntegrationWebhook: 'integration',
  listIntegrationWebhooks: 'integration',
  updateIntegrationWebhook: 'integration',
  deleteIntegrationWebhook: 'integration',
  listIntegrationWebhookDeliveries: 'integration',
  replayIntegrationWebhookDelivery: 'integration',
  listGitHubConnectors: 'integration',
  createGitHubConnector: 'integration',
  updateGitHubConnector: 'integration',
  deleteGitHubConnector: 'integration',
  getGitHubRepo: 'integration',
  listGitHubRepos: 'integration',
  syncGitHubIntegration: 'integration',
  // Org-integration CRUD (OrgIntegration rows) — the connect/grant/scope/order
  // lifecycle behind /org-integrations/*. Distinct from the OAuth-app
  // /integrations/* methods above.
  listOrgIntegrations: 'integration',
  upsertOrgIntegration: 'integration',
  deleteOrgIntegration: 'integration',
  assignOrgIntegrationScope: 'integration',
  reorderOrgIntegrations: 'integration',
  listOrgIntegrationKinds: 'integration',
  // Capability dispatch (data plane) — the per-kind call surface behind the
  // CRUD above.
  callOrgIntegrationCapability: 'integration',
  // Marketplace install/uninstall/entitlement lifecycle (CU-INT §180) —
  // /marketplace/integrations/*.
  listMarketplaceEntitlements: 'integration',
  checkMarketplaceEntitlement: 'integration',
  installMarketplaceIntegration: 'integration',
  uninstallMarketplaceIntegration: 'integration',

  // Feature flag methods (system-level + experiments)
  getFeatureFlags: 'featureFlag',
  getFeatureFlag: 'featureFlag',
  getAdminFeatureFlags: 'featureFlag',
  createFeatureFlag: 'featureFlag',
  updateFeatureFlag: 'featureFlag',
  archiveFeatureFlag: 'featureFlag',

  // Organization methods
  createOrganization: 'organization',
  listOrganizations: 'organization',
  checkOrganizationSlug: 'organization',
  getOrganization: 'organization',
  updateOrganization: 'organization',
  transferOrgOwnership: 'organization',
  deleteOrganization: 'organization',
  listOrgMembers: 'organization',
  addOrgMember: 'organization',
  updateOrgMember: 'organization',
  removeOrgMember: 'organization',
  createTeam: 'organization',
  listTeams: 'organization',
  updateTeam: 'organization',
  deleteTeam: 'organization',
  listTeamMembers: 'organization',
  listOrgTeamMembers: 'organization',
  addTeamMember: 'organization',
  updateTeamMember: 'organization',
  removeTeamMember: 'organization',
  listAgentAssignments: 'organization',
  assignAgent: 'organization',
  updateAgentAssignment: 'organization',
  unassignAgent: 'organization',
  setMemberStatus: 'organization',
  createOrgInvitation: 'organization',
  listOrgInvitations: 'organization',
  revokeOrgInvitation: 'organization',
  acceptOrgInvitation: 'organization',
  // Team-scoped invitations (Phase B). `inviteToTeam` aliases
  // `createTeamInvitation` so DOMQL call sites read clearly.
  listTeamInvitations: 'organization',
  createTeamInvitation: 'organization',
  inviteToTeam: 'organization',
  revokeTeamInvitation: 'organization',
  acceptTeamInvitation: 'organization',
  getOrgProjectPermissions: 'organization',
  updateOrgProjectPermissions: 'organization',
  listTeamAccess: 'organization',
  grantTeamAccess: 'organization',
  updateTeamAccess: 'organization',
  revokeTeamAccess: 'organization',
  createOrgProject: 'organization',
  adminListOrganizations: 'organization',
  getCreditPool: 'organization',
  updateCreditPool: 'organization',
  getSso: 'organization',
  updateSso: 'organization',
  getScim: 'organization',
  updateScim: 'organization',

  // Single-round-trip boot composite — GET /core/boot. Collapses the
  // workspace shell's boot-sequence waterfall (getMe -> getOrganization +
  // listWorkspaces + getWorkspace -> users.members + homeDashboardPrefs)
  // into one call. See services/BootService.js.
  boot: 'boot',

  // Workspace MCP registry — /core/mcp-connectors/*. Flat methods are
  // namespaced (`mcpConnector*`) because `list`/`create`/`get` are far too
  // generic for the flat SDK surface. See services/McpConnectorService.js.
  mcpConnectorList: 'mcpConnector',
  mcpConnectorGet: 'mcpConnector',
  mcpConnectorCreate: 'mcpConnector',
  mcpConnectorUpdate: 'mcpConnector',
  mcpConnectorDiscover: 'mcpConnector',
  mcpConnectorSetStatus: 'mcpConnector',
  mcpConnectorRemove: 'mcpConnector',

  // Voice v2 — /core/ai/voice/*. `voiceTts` resolves to a STREAMING Response
  // (not JSON) so the caller can start playback before the clip finishes;
  // see services/VoiceService.js.
  voiceTranscribe: 'voice',
  voiceTts: 'voice',

  createWorkspace: 'workspace',
  listWorkspaces: 'workspace',
  getWorkspace: 'workspace',
  updateWorkspace: 'workspace',
  updateWorkspaceSettings: 'workspace',
  deleteWorkspace: 'workspace',
  listWorkspaceMembers: 'workspace',
  addWorkspaceMember: 'workspace',
  updateWorkspaceMemberRole: 'workspace',
  removeWorkspaceMember: 'workspace',
  // Records-plane LOCATION axis — read/assign WorkspaceMember.recordScope
  // (server a95cda9f). See WorkspaceService.js for the full contract.
  getWorkspaceMemberRecordScope: 'workspace',
  updateWorkspaceMemberRecordScope: 'workspace',
  grantWorkspaceTeamAccess: 'workspace',
  revokeWorkspaceTeamAccess: 'workspace',
  getBilling: 'workspace',
  getCreditBalance: 'workspace',
  getCreditLedger: 'workspace',
  getWorkspaceUsage: 'workspace',
  createCreditTopupCheckout: 'workspace',
  getSpendControls: 'workspace',
  updateSpendControls: 'workspace',

  // App interdependencies (Manifest v2.1 — spec-app-dependencies.md §6).
  // Atomic, dependency-aware install/uninstall — distinct from the
  // whole-array `updateWorkspaceSettings({workspaceApps})` writer above.
  getWorkspaceAppDependencies: 'workspace',
  installWorkspaceApps: 'workspace',
  removeWorkspaceApp: 'workspace',

  // Workspace public config + write-only private-secret management.
  // Trusted runtime secret resolution is intentionally not browser-exposed.
  getWorkspacePublicConfig: 'workspace',
  upsertWorkspacePublicConfig: 'workspace',
  deleteWorkspacePublicConfig: 'workspace',
  listWorkspaceSecrets: 'workspace',
  upsertWorkspaceSecret: 'workspace',
  deleteWorkspaceSecret: 'workspace',

  // Public rate card from CreditsService — unauthenticated, used by the
  // admin /admin/usage operator view and /data/plans pricing-model
  // overview. Without this entry sdk.getRates is undefined.
  getRates: 'credits',

  // Project-scoped credit/billing surface — parallels the workspace-scoped
  // methods above so the admin/project-edit screens can read credits +
  // spend controls + run top-ups for a single project (legacy billing
  // path) without going through sdk.getService('credits').X(...).
  getProjectBalance: 'credits',
  getProjectLedger: 'credits',
  getProjectSpendControls: 'credits',
  updateProjectSpendControls: 'credits',
  topupProjectCredits: 'credits',

  // Subscription feature gates — project-feature gating + pricing options.
  getPricingOptions: 'subscription',
  canAccessProjectFeature: 'subscription',
  grantProjectFeature: 'subscription',
  revokeProjectFeature: 'subscription',

  // Tracking config/flush — paired with trackEvent (already registered
  // above). Admin tools that drain the analytics queue or reconfigure
  // the tracker call these directly.
  configure: 'tracking',
  flush: 'tracking',

  // Workspace permissions & project management
  getWorkspacePermissions: 'workspace',
  createWorkspaceProject: 'workspace',

  // Workspace invitations
  listWorkspaceInvitations: 'workspace',
  createWorkspaceInvitation: 'workspace',
  revokeWorkspaceInvitation: 'workspace',
  acceptWorkspaceInvitation: 'workspace',

  setProjectSourceAccess: 'project',

  // Project workspace transfer
  transferProjectToWorkspace: 'project',

  // Admin rate-limit stats
  getRateLimitStats: 'admin',

  // Allocation rules
  listRules: 'allocationRule',
  getRule: 'allocationRule',
  createRule: 'allocationRule',
  updateRule: 'allocationRule',
  deleteRule: 'allocationRule',

  // Shared assets
  createAsset: 'sharedAsset',
  listAssets: 'sharedAsset',
  getAsset: 'sharedAsset',
  updateAsset: 'sharedAsset',
  deleteAsset: 'sharedAsset',

  // Canvas layout — workspace-level layout persistence
  // GET  /workspaces/:wsId/canvas-layout  → { positions, groups, version, updatedAt }
  // PATCH /workspaces/:wsId/canvas-layout → { version, updatedAt }
  // Subscribe: 'canvas-layout-changed' socket event.
  getCanvasLayout: 'canvasLayout',
  patchCanvasLayout: 'canvasLayout',
  subscribeWorkspaceCanvasLayout: 'canvasLayout',
  // Subscribe: 'file-canvas-changed' socket event (live /files desktop).
  subscribeWorkspaceFileCanvas: 'canvasLayout',

  // Meet — anonymous guest waiting-room flow + host remote mute.
  // POST /core/meet/guest/meta    → { name, require*, ... }      (no auth)
  // POST /core/meet/guest/request → { waitingId, status, ... }   (no auth)
  // POST /core/meet/guest/status  → { status }                   (no auth)
  // POST /core/meet/guest/token   → { token, url, identity }     (no auth)
  // POST /core/meet/mute          → { ok: true }                 (auth, host-only)
  meetGuestMeta: 'meet',
  meetGuestRequest: 'meet',
  meetGuestStatus: 'meet',
  meetGuestToken: 'meet',
  meetMuteParticipant: 'meet',

  // Calendar — workspace-scoped events against /core/calendar/* (auth).
  // Mongo-backed (the Supabase store was retired). Writes are owner/admin-gated.
  // GET  /core/calendar/events       → list within a window
  // GET  /core/calendar/events/:id   → get one
  // POST /core/calendar/events       → create (owner/admin)
  // PATCH  /core/calendar/events/:id → update (owner/admin)
  // DELETE /core/calendar/events/:id → soft delete (owner/admin)
  // POST /core/calendar/sync         → external Google sync pass (owner/admin)
  // GET  /core/calendar/sync         → sync cursor status
  calendarListEvents: 'calendar',
  calendarGetEvent: 'calendar',
  calendarCreateEvent: 'calendar',
  calendarUpdateEvent: 'calendar',
  calendarDeleteEvent: 'calendar',
  calendarSync: 'calendar',
  calendarSyncStatus: 'calendar',

  // Builds & Deploy — workspace-scoped /core/builds/* (GitHub App install →
  // repo import → Cloud Build/buildpacks → Cloud Run). Backs /infra.
  // GET  /builds/workspaces/:wsId/github               → connect state
  // GET  /builds/workspaces/:wsId/repos                → installation repos
  // GET/POST /builds/workspaces/:wsId/imports          → WorkspaceRepo rows
  // PATCH/DELETE /builds/workspaces/:wsId/imports/:id  → update / remove import
  // POST /builds/workspaces/:wsId/imports/:id/trigger  → queue Build
  // GET  /builds/workspaces/:wsId/builds[/:id]         → Build rows / poll
  // GET  /builds/workspaces/:wsId/builds/:id/logs      → log tail / link-out
  // POST /builds/workspaces/:wsId/builds/:id/deploy    → Cloud Run Deployment
  // GET  /builds/workspaces/:wsId/deployments          → Deployment rows
  // POST /builds/workspaces/:wsId/deployments/:id/rollback → NEW Deployment
  // POST /builds/workspaces/:wsId/deployments/:id/scale    → scale in place
  // GET  /builds/workspaces/:wsId/deployments/:id/metrics  → DeploymentMetric
  //      buckets (verb 7 — MetricsCollectorService, GATED OFF by default)
  getBuildsGitHubState: 'builds',
  listBuildRepos: 'builds',
  listBuildImports: 'builds',
  createBuildImport: 'builds',
  updateBuildImport: 'builds',
  deleteBuildImport: 'builds',
  triggerBuild: 'builds',
  listBuilds: 'builds',
  getBuild: 'builds',
  getBuildLogs: 'builds',
  deployBuild: 'builds',
  listBuildDeployments: 'builds',
  rollbackDeployment: 'builds',
  scaleDeployment: 'builds',
  getDeploymentMetrics: 'builds',
  // Subscribe: 'build-status-changed' + 'deployment-status-changed' socket events.
  subscribeWorkspaceBuilds: 'builds',

  // Project custom-domain lifecycle (server PR #440 — API-owned check/status/
  // instructions on /core/projects/:projectId/domains/*). Extends the existing
  // dns-service project-domain methods above.
  checkProjectDomain: 'dns',
  checkProjectCustomDomain: 'dns',
  getProjectCustomDomainStatus: 'dns',
  getProjectDomainInstructions: 'dns',
  getProjectCustomDomainInstructions: 'dns',
  startProjectCustomDomainSetup: 'dns',
  pollProjectCustomDomainStatus: 'dns',

  // Public, unauthenticated storefront catalog reads (StorefrontService,
  // tickets/server.md "storefront catalog read API", NAT-V1-25..30). No
  // workspace-membership identity — see BaseService._requiresInit for the
  // no-auth-header carve-out these three method names share with the
  // meet-guest / demo flows.
  listStorefrontProducts: 'storefront',
  getStorefrontProduct: 'storefront',
  listStorefrontCollection: 'storefront',

  // Job-application pipeline (tickets/server.md "job-application pipeline
  // backend") — public job listings + the public application WRITE, same
  // no-auth-header carve-out as the catalog reads above.
  listStorefrontJobs: 'storefront',
  getStorefrontJob: 'storefront',
  applyToStorefrontJob: 'storefront',

  // Persona sessions (tickets/sonnet.md PERSONA-4) — role simulation
  // ("view as <role>"), NEVER per-person impersonation; scope is resolved
  // server-side in claimsToScope (server 886a9b27).
  // POST /core/persona/start { role } → adopts the persona-claim token
  // POST /core/persona/end   {}       → idempotent, never rejects
  // getPersona → local decode of the active token's persona claim, or null
  // ⚠ All three return Promises (init gate + async service methods):
  // `if (sdk.getPersona())` is always truthy — await the resolved value.
  startPersona: 'persona',
  endPersona: 'persona',
  getPersona: 'persona',

  // Storefront customer identity (tickets/server.md "storefront customer
  // identity layer", NAT-V1-25/27/28) — register/login/OTP/reset are
  // unauthenticated (see BaseService._requiresInit); getStorefrontCustomerMe
  // is authenticated but via an explicitly-passed storefront-customer token,
  // never the SDK's own signed-in-user session (see StorefrontService.js).
  registerStorefrontCustomer: 'storefront',
  loginStorefrontCustomer: 'storefront',
  requestStorefrontCustomerOtp: 'storefront',
  verifyStorefrontCustomerOtp: 'storefront',
  resetStorefrontCustomerPassword: 'storefront',
  getStorefrontCustomerMe: 'storefront'
}
