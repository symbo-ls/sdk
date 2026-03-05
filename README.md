# @symbo.ls/sdk

[![npm version](https://img.shields.io/npm/v/@symbo.ls/sdk.svg)](https://www.npmjs.com/package/@symbo.ls/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@symbo.ls/sdk.svg)](https://www.npmjs.com/package/@symbo.ls/sdk)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@symbo.ls/sdk)](https://bundlephobia.com/package/@symbo.ls/sdk)
[![license](https://img.shields.io/npm/l/@symbo.ls/sdk.svg)](https://github.com/nicholasgasior/symbo.ls/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@symbo.ls/sdk.svg)](https://nodejs.org)
[![ESM](https://img.shields.io/badge/module-ESM%20%7C%20CJS-blue)](https://www.npmjs.com/package/@symbo.ls/sdk)

> Official SDK for the [Symbols](https://symbols.app) design platform — manage projects, collaborate in real-time, handle branches, pull requests, and more.

## Installation

```bash
npm install @symbo.ls/sdk
```

## Basic Usage

### Initialize SDK

```javascript
import { SDK } from '@symbo.ls/sdk'

const sdk = new SDK({
  apiUrl: 'https://api.symbols.app',
  socketUrl: 'https://api.symbols.app',
  timeout: 30000,
  retryAttempts: 3,
  debug: false
})

await sdk.initialize({
  authToken: 'your-auth-token',
  appKey: 'your-app-key'
})
```

### Service Access

```javascript
const auth = sdk.getService('auth')
const project = sdk.getService('project')
const branch = sdk.getService('branch')
const pullRequest = sdk.getService('pullRequest')
const collab = sdk.getService('collab')
const file = sdk.getService('file')
const payment = sdk.getService('payment')
const plan = sdk.getService('plan')
const subscription = sdk.getService('subscription')
const dns = sdk.getService('dns')
const admin = sdk.getService('admin')
const screenshot = sdk.getService('screenshot')
const tracking = sdk.getService('tracking')
const waitlist = sdk.getService('waitlist')
const metrics = sdk.getService('metrics')
const integration = sdk.getService('integration')
const featureFlag = sdk.getService('featureFlag')
```

All service methods are also available directly on the SDK instance via proxy methods:

```javascript
// These are equivalent:
sdk.getService('project').getProject(projectId)
sdk.getProject(projectId)
```

### Status & Context

```javascript
// Check if SDK is ready
sdk.isReady()

// Get detailed status
const status = sdk.getStatus()
// { ready: true, services: [...], context: {...} }

// Update context
sdk.updateContext({ ... })

// Cleanup
await sdk.destroy()
```

### Root Event Bus

The SDK exposes a global event bus for cross-service communication:

```javascript
sdk.rootBus.on('checkpoint:done', (payload) => { ... })
sdk.rootBus.on('clients:updated', (payload) => { ... })
sdk.rootBus.on('bundle:done', (payload) => { ... })
sdk.rootBus.on('bundle:error', (payload) => { ... })
```

---

## Services

### Auth Service

**Authentication:**

```javascript
const auth = sdk.getService('auth')

await auth.register(userData, options)
await auth.login(email, password, options)
await auth.logout()
await auth.refreshToken(refreshToken)
await auth.googleAuth(idToken, inviteToken, options)
await auth.googleAuthCallback(code, redirectUri, inviteToken, options)
await auth.githubAuth(code, inviteToken, options)
await auth.requestPasswordReset(email)
await auth.confirmPasswordReset(token, password)
await auth.confirmRegistration(token)
await auth.requestPasswordChange()
await auth.confirmPasswordChange(currentPassword, newPassword, code)
```

**User Data:**

```javascript
await auth.getMe(options)
auth.getStoredAuthState()
auth.getAuthToken()
auth.getUserProfile()
await auth.updateUserProfile(profileData)
await auth.getUserProjects()
await auth.getUser(userId)
await auth.getUserByEmail(email)
auth.isAuthenticated()
auth.hasValidTokens()
auth.getCurrentUser()
```

**Project Roles:**

```javascript
await auth.getMyProjectRole(projectId)       // cached
await auth.getMyProjectRoleByKey(projectKey)  // cached
auth.clearProjectRoleCache(projectId)
```

**Permissions:**

```javascript
auth.hasPermission(requiredPermission)
auth.hasGlobalPermission(globalRole, requiredPermission)
auth.checkProjectPermission(projectRole, requiredPermission)
auth.checkProjectFeature(projectTier, feature)
await auth.canPerformOperation(projectId, operation, options)
await auth.withPermission(projectId, operation, action)
```

### Project Service

**Project Management:**

```javascript
const project = sdk.getService('project')

await project.createProject(projectData)
await project.getProjects(params)
await project.getProject(projectId)
await project.getProjectByKey(key)
await project.getProjectDataByKey(key, options)
await project.getPublicProject(projectId)
await project.listPublicProjects(params)
await project.updateProject(projectId, data)
await project.updateProjectComponents(projectId, components)
await project.updateProjectSettings(projectId, settings)
await project.updateProjectName(projectId, name)
await project.updateProjectPackage(projectId, pkg)
await project.duplicateProject(projectId, newName, newKey, targetUserId)
await project.removeProject(projectId)
await project.checkProjectKeyAvailability(key)
```

**Role Permissions Config:**

```javascript
await project.getProjectRolePermissionsConfig(projectId, options)
await project.updateProjectRolePermissionsConfig(projectId, rolePermissions, options)
```

**Members:**

```javascript
await project.getProjectMembers(projectId)
await project.inviteMember(projectId, email, role, options)
await project.createMagicInviteLink(projectId, options)
await project.acceptInvite(token)
await project.updateMemberRole(projectId, memberId, role)
await project.removeMember(projectId, memberId)
```

**Libraries:**

```javascript
await project.getAvailableLibraries(params)
await project.getProjectLibraries(projectId)
await project.addProjectLibraries(projectId, libraryIds)
await project.removeProjectLibraries(projectId, libraryIds)
```

**Project Data (Version Control):**

```javascript
await project.applyProjectChanges(projectId, changes, options)
// changes: [['update', ['components', 'Button'], { color: 'blue' }], ['delete', ['pages', 'old']]]
// options: { message: 'Update button', type: 'patch' }

await project.getProjectData(projectId, options)
await project.getProjectVersions(projectId, options)
await project.restoreProjectVersion(projectId, version, options)
await project.updateProjectItem(projectId, path, value, options)
await project.deleteProjectItem(projectId, path, options)
await project.setProjectValue(projectId, path, value, options)
await project.addProjectItems(projectId, items, options)
await project.getProjectItemByPath(projectId, path, options)
```

**Environments:**

```javascript
await project.listEnvironments(projectId, options)
await project.activateMultipleEnvironments(projectId, options)
await project.upsertEnvironment(projectId, envKey, config, options)
await project.updateEnvironment(projectId, envKey, updates, options)
await project.publishToEnvironment(projectId, envKey, payload, options)
await project.deleteEnvironment(projectId, envKey, options)
await project.promoteEnvironment(projectId, fromEnvKey, toEnvKey, options)
```

**Favorites & Recent:**

```javascript
await project.getFavoriteProjects()
await project.addFavoriteProject(projectId)
await project.removeFavoriteProject(projectId)
await project.getRecentProjects(options)
```

**Access Control:**

```javascript
await project.setProjectAccess(projectId, access)       // account/team/organization/public
await project.setProjectVisibility(projectId, visibility) // public/private/password-protected
```

### Branch Service

```javascript
const branch = sdk.getService('branch')

await branch.listBranches(projectId)
await branch.createBranch(projectId, branchData)
await branch.deleteBranch(projectId, branchName)
await branch.renameBranch(projectId, branchName, newName)
await branch.getBranchChanges(projectId, branchName, options)
await branch.mergeBranch(projectId, branchName, mergeData)
await branch.resetBranch(projectId, branchName)
await branch.publishVersion(projectId, publishData)

// Helper methods
await branch.createFeatureBranch(projectId, featureName)  // creates 'feature/<name>'
await branch.createHotfixBranch(projectId, hotfixName)
await branch.branchExists(projectId, branchName)
await branch.previewMerge(projectId, sourceBranch, targetBranch)
await branch.commitMerge(projectId, sourceBranch, options)
await branch.getBranchStatus(projectId, branchName)
await branch.deleteBranchSafely(projectId, branchName, options)
await branch.getBranchesWithStatus(projectId)
branch.validateBranchName(branchName)
branch.sanitizeBranchName(branchName)
```

### Pull Request Service

```javascript
const pr = sdk.getService('pullRequest')

await pr.createPullRequest(projectId, pullRequestData)
await pr.listPullRequests(projectId, options)
await pr.getPullRequest(projectId, prId)
await pr.reviewPullRequest(projectId, prId, reviewData)
await pr.addPullRequestComment(projectId, prId, commentData)
await pr.mergePullRequest(projectId, prId)
await pr.getPullRequestDiff(projectId, prId)
await pr.closePullRequest(projectId, prId)
await pr.reopenPullRequest(projectId, prId)

// Helper methods
await pr.approvePullRequest(projectId, prId, comment)
await pr.requestPullRequestChanges(projectId, prId, threads)
await pr.getOpenPullRequests(projectId, options)
await pr.getClosedPullRequests(projectId, options)
await pr.getMergedPullRequests(projectId, options)
await pr.isPullRequestMergeable(projectId, prId)
await pr.getPullRequestStatusSummary(projectId, prId)
await pr.getPullRequestStats(projectId, options)
```

### Collab Service

Real-time collaboration via WebSocket and Yjs.

```javascript
const collab = sdk.getService('collab')

// Connection
await collab.connect({ projectId, branch, authToken })
collab.disconnect()
collab.isConnected()
collab.getConnectionInfo()

// Data updates
collab.updateData(tuples, options)
collab.addItem(type, data, opts)
collab.addMultipleItems(items, opts)
collab.updateItem(type, data, opts)
collab.deleteItem(type, key, opts)

// Undo/Redo
collab.undo()
collab.redo()
collab.canUndo()
collab.canRedo()
collab.getUndoStackSize()
collab.getRedoStackSize()
collab.clearUndoHistory()
collab.checkpoint()

// Presence
collab.sendCursor(data)
collab.sendPresence(data)
collab.toggleLive(flag)

// Accessors
collab.ydoc   // Yjs document
collab.socket  // Socket instance
```

### File Service

```javascript
const file = sdk.getService('file')

await file.uploadFile(file, options)
await file.updateProjectIcon(projectId, iconFile)
await file.uploadImage(imageFile, options)
await file.uploadDocument(documentFile, options)
await file.uploadMultipleFiles(files, options)
file.getFileUrl(fileId)
file.validateFile(file, options)
```

### Payment Service

```javascript
const payment = sdk.getService('payment')

await payment.checkout(options)
await payment.getSubscriptionStatus(projectId)
await payment.hasActiveSubscription(projectId)
await payment.getSubscriptionDetails(projectId)
await payment.checkoutForPlan(options)
await payment.checkoutForTeam(options)
await payment.getSubscriptionSummary(projectId)
```

### Plan Service

```javascript
const plan = sdk.getService('plan')

// Public (no auth required)
await plan.getPlans()
await plan.getPlan(planId)
await plan.getPlansWithPricing()
await plan.getPlanByKey(key)
await plan.getActivePlans()
await plan.getPlansByPriceRange(minPrice, maxPrice)

// Admin
await plan.getAdminPlans()
await plan.createPlan(planData)
await plan.updatePlan(planId, planData)
await plan.deletePlan(planId)
await plan.initializePlans()
```

### Subscription Service

```javascript
const subscription = sdk.getService('subscription')

await subscription.createSubscription(subscriptionData)
await subscription.getProjectStatus(projectId)
await subscription.getUsage(subscriptionId)
await subscription.cancelSubscription(subscriptionId)
await subscription.listInvoices(subscriptionId, options)
await subscription.getPortalUrl(projectId)
await subscription.getProjectSubscription(projectId)
await subscription.getProjectUsage(projectId)
await subscription.hasActiveSubscription(projectId)
await subscription.changeSubscription(projectId, planId)
await subscription.downgrade(projectId)
```

### DNS Service

```javascript
const dns = sdk.getService('dns')

await dns.createDnsRecord(domain, options)
await dns.getDnsRecord(domain)
await dns.removeDnsRecord(domain)
await dns.getCustomHost(hostname)
await dns.addProjectCustomDomains(projectId, customDomains, options)
await dns.isDomainAvailable(domain)
await dns.getDomainStatus(domain)
await dns.verifyDomainOwnership(domain)
await dns.getProjectDomains(projectId)
await dns.removeProjectCustomDomain(projectId, domain)
dns.validateDomain(domain)
dns.formatDomain(domain)
dns.extractDomainFromUrl(url)
```

### Admin Service

```javascript
const admin = sdk.getService('admin')

await admin.getAdminUsers(params)
await admin.updateUser(userId, userData)
await admin.searchAdminUsers(searchQuery, options)
await admin.getAdminUsersByEmails(emails)
await admin.getAdminUsersByIds(ids)
await admin.assignProjectsToUser(userId, options)
await admin.assignSpecificProjectsToUser(userId, projectIds, role)
await admin.assignAllProjectsToUser(userId, role)
await admin.getUserStats(userId)
await admin.bulkUpdateUsers(updates)
await admin.getUsersByRole(role)
await admin.getUsersByStatus(status)
await admin.activateUser(userId)
await admin.deactivateUser(userId)
await admin.suspendUser(userId)
await admin.promoteToAdmin(userId)
await admin.demoteFromAdmin(userId)
```

### Screenshot Service

```javascript
const screenshot = sdk.getService('screenshot')

await screenshot.createScreenshotProject(payload)
await screenshot.getProjectScreenshots(projectKey, params)
await screenshot.reprocessProjectScreenshots(projectKey, body)
await screenshot.recreateProjectScreenshots(projectKey, body)
await screenshot.deleteProjectScreenshots(projectKey)
await screenshot.getThumbnailCandidate(projectKey, options)
await screenshot.updateProjectThumbnail(projectKey, body)
await screenshot.refreshThumbnail(projectKey)
await screenshot.getPageScreenshot(screenshotId, format)
await screenshot.getComponentScreenshot(screenshotId, format)
await screenshot.getScreenshotByKey(key)
await screenshot.getQueueStatistics()
```

### Tracking Service (Grafana Faro)

```javascript
const tracking = sdk.getService('tracking')

// Events
tracking.trackEvent('purchase', { amount: 42, currency: 'USD' })
tracking.trackError(new Error('Login failed'), { context: { screen: 'Login' } })
tracking.captureException(error, context)
tracking.trackMeasurement('cart_value', 42, { context: { currency: 'USD' } })
tracking.trackView('Dashboard', { section: 'Analytics' })

// Logging
tracking.logMessage(message)
tracking.logDebug(message)
tracking.logInfo(message)
tracking.logWarning(message)
tracking.logError(message)
tracking.addBreadcrumb('Open modal', { id: 'planLimits' })

// User & Session
tracking.setUser({ id: 'u_123', role: 'admin' })
tracking.clearUser()
tracking.setSession(session)
tracking.clearSession()

// Global Attributes
tracking.setGlobalAttributes(attributes)
tracking.setGlobalAttribute(key, value)
tracking.removeGlobalAttribute(key)

// Queue & Status
tracking.flushQueue()
tracking.getClient()
tracking.isEnabled()
tracking.isInitialized()
```

#### Tracking Configuration

```javascript
const sdk = new SDK({
  tracking: {
    url: 'https://<your-faro-receiver-url>',
    appName: 'Symbols Platform',
    environment: 'production',
    appVersion: '1.0.0',
    sessionTracking: true,
    enableTracing: true,
    globalAttributes: { region: 'us-east-1' }
  }
})
```

Tracking is automatically disabled on localhost and in non-browser environments.

### Waitlist Service

```javascript
const waitlist = sdk.getService('waitlist')

await waitlist.joinWaitlist(data)              // public
await waitlist.listWaitlistEntries(options)     // admin
await waitlist.updateWaitlistEntry(id, update)  // admin
await waitlist.inviteWaitlistEntry(id)          // admin
```

### Metrics Service

```javascript
const metrics = sdk.getService('metrics')

await metrics.getContributions(options)  // contribution heat-map stats
```

### Integration Service

```javascript
const integration = sdk.getService('integration')

// Integration management
await integration.integrationWhoami(apiKey, options)
await integration.listIntegrations(options)
await integration.createIntegration(data)
await integration.updateIntegration(integrationId, update)

// API Keys
await integration.createIntegrationApiKey(integrationId, data)
await integration.listIntegrationApiKeys(integrationId)
await integration.revokeIntegrationApiKey(integrationId, keyId)

// Webhooks
await integration.createIntegrationWebhook(integrationId, data)
await integration.listIntegrationWebhooks(integrationId)
await integration.updateIntegrationWebhook(integrationId, webhookId, update)
await integration.deleteIntegrationWebhook(integrationId, webhookId)
await integration.listIntegrationWebhookDeliveries(integrationId, webhookId, options)
await integration.replayIntegrationWebhookDelivery(integrationId, webhookId, deliveryId)

// GitHub Connectors
await integration.listGitHubConnectors()
await integration.createGitHubConnector(data)
await integration.updateGitHubConnector(connectorId, update)
await integration.deleteGitHubConnector(connectorId)
```

### Feature Flag Service

```javascript
const featureFlag = sdk.getService('featureFlag')

// User-facing
await featureFlag.getFeatureFlags(params)
await featureFlag.getFeatureFlag(key)

// Admin
await featureFlag.getAdminFeatureFlags(params)
await featureFlag.createFeatureFlag(flagData)
await featureFlag.updateFeatureFlag(id, patch)
await featureFlag.archiveFeatureFlag(id)
```

---

## Token Management

The SDK includes automatic token management with persistence and refresh:

- **Automatic Token Refresh** - tokens are refreshed before expiration
- **Persistent Storage** - tokens persist across page refreshes via localStorage
- **Secure Handling** - automatic cleanup on logout
- **Flexible Storage** - supports localStorage, sessionStorage, or memory

```javascript
import { getTokenManager } from '@symbo.ls/sdk'

const tokenManager = getTokenManager({
  storageType: 'localStorage',        // 'localStorage' | 'sessionStorage' | 'memory'
  refreshBuffer: 60 * 1000,           // refresh 1 minute before expiry
  apiUrl: '/api',
  onTokenRefresh: (tokens) => { ... },
  onTokenExpired: () => { ... },
  onTokenError: (error) => { ... }
})
```

All authenticated API calls automatically use fresh tokens via the BaseService `_request()` method.

---

## Permissions

### Role Permissions

```javascript
// Global roles
const ROLE_PERMISSIONS = {
  guest: ['viewPublicProjects'],
  user: ['viewPublicProjects', 'createProject'],
  admin: ['viewPublicProjects', 'createProject', 'governance'],
  superAdmin: ['viewPublicProjects', 'createProject', 'governance', 'managePlatform']
}

// Project roles
const PROJECT_ROLE_PERMISSIONS = {
  guest: ['platformSettings', 'showContent'],
  editor: ['platformSettings', 'showContent', 'showCode', 'editMode', 'versions'],
  admin: [/* editor + */ 'inviteMembers', 'branchProtection', 'projectSettings'],
  owner: [/* admin + */ 'copyPasteAllowanceSetting', 'iam']
}
```

### Permission Checks

```javascript
auth.hasPermission('edit')
auth.hasGlobalPermission('admin', 'governance')
auth.checkProjectPermission('editor', 'editMode')
auth.checkProjectFeature('pro1', 'aiCopilot')  // returns tier limit (e.g. 5)
await auth.canPerformOperation(projectId, 'edit', { checkFeatures: true })
await auth.withPermission(projectId, 'edit', () => { /* action */ })
```

### Tier Features

| Feature | Free | Pro1 | Pro2 |
|---------|------|------|------|
| aiCopilot | 3 | 5 | 15 |
| aiChatbot | 3 | 5 | 15 |

---

## Environment Configuration

The SDK auto-detects environment from hostname and provides:

```javascript
import { environment } from '@symbo.ls/sdk'

environment.apiUrl      // HTTP API URL
environment.socketUrl   // WebSocket URL
environment.features    // { trackingEnabled, betaFeatures, newUserOnboarding }
```

Supported environments: local, development, testing, upcoming, staging, preview, production.

---

## Error Handling

```javascript
try {
  await sdk.initialize()
} catch (error) {
  console.error('SDK initialization failed:', error.message)
}

try {
  await project.mergePullRequest(projectId, prId)
} catch (error) {
  if (error.message.includes('conflicts')) {
    // Handle merge conflicts
  } else if (error.message.includes('403')) {
    // Handle permission errors
  }
}
```

---

## Direct Service Creation

Services can be created independently without the SDK class:

```javascript
import { createAuthService, createProjectService } from '@symbo.ls/sdk'

const auth = createAuthService({ context, options })
await auth.init({ context, options })
```

Available factory functions: `createAuthService`, `createCollabService`, `createProjectService`, `createPlanService`, `createFileService`, `createPaymentService`, `createDnsService`, `createBranchService`, `createPullRequestService`, `createAdminService`, `createSubscriptionService`, `createScreenshotService`, `createTrackingService`, `createWaitlistService`, `createMetricsService`, `createIntegrationService`, `createFeatureFlagService`.
