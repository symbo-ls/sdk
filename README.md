# SDK
## Installation
```bash
npm install @symbo.ls/sdk
```

## Basic Usage

### Initialize SDK
```javascript
import { SDK } from '@symbo.ls/sdk'

const sdk = new SDK({
  useNewServices: true,  // Use new service implementations
  apiUrl: 'https://api.symbols.app',
  socketUrl: 'https://api.symbols.app',
  timeout: 30000,
  retryAttempts: 3,
  debug: false
})

// Initialize with context
await sdk.initialize({
  authToken: 'your-auth-token',
  appKey: 'your-app-key',
})
```

### Service Access
```javascript
// Get service instances
const auth = sdk.getService('auth')
const socket = sdk.getService('socket')
const symstory = sdk.getService('symstory')
const based = sdk.getService('based')
const ai = sdk.getService('ai')
```

### Status Checking
```javascript
// Check if SDK is ready
const ready = sdk.isReady()

// Get detailed status
const status = sdk.getStatus()
console.log(status)
/* Output:
{
  ready: true,
  services: [
    { name: 'auth', ready: true, ... },
    { name: 'socket', ready: true, ... },
    { name: 'symstory', ready: true, ... },
    { name: 'based', ready: true, ... },
    { name: 'ai', ready: true, ... }
  ],
  context: { ... }
}
*/
```

### Context Management
```javascript
// Update context
sdk.updateContext({
  auth: {
    authToken: 'new-token'
  }
})
```

## Service-Specific Usage

### Auth Service
```javascript
const auth = sdk.getService('auth')

/**
 * Login a user
 * @param {string} email - User's email
 * @param {string} password - User's password
 */
await auth.login(email, password)

/**
 * Register a new user
 * @param {Object} userData - User data
 */
await auth.register(userData)

/**
 * Logout the current user
 */
await auth.logout()

/**
 * Request a password reset
 * @param {string} email - User's email
 */
await auth.requestPasswordReset(email)

/**
 * Confirm a password reset
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 */
await auth.confirmPasswordReset(token, newPassword)

/**
 * Update a user's role
 * @param {string} userId - User ID
 * @param {string} newRole - New role
 */
await auth.updateUserRole(userId, newRole)

/**
 * Update a member's role in a project
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string} role - New role
 */
await auth.updateMemberRole(projectId, userId, role)

/**
 * Update a project's tier
 * @param {string} projectId - Project ID
 * @param {string} newTier - New tier
 */
await auth.updateProjectTier(projectId, newTier)

/**
 * Invite a member to a project
 * @param {string} projectId - Project ID
 * @param {string} email - Member's email
 * @param {string} role - Member's role
 * @param {string} name - Member's name
 */
await auth.inviteMember(projectId, email, role, name)

/**
 * Accept an invite
 * @param {string} token - Invite token
 */
await auth.acceptInvite(token)

/**
 * Confirm a user's registration
 * @param {string} token - Registration token
 */
await auth.confirmRegistration(token)

/**
 * Get members of a project
 * @param {string} projectId - Project ID
 */
await auth.getProjectMembers(projectId)

/**
 * Check if a user has a specific permission
 * @param {string} projectId - Project ID
 * @param {string} permission - Permission to check
 */
const hasPermission = auth.hasPermission(projectId, 'edit')

/**
 * Check if a user has a global permission
 * @param {string} globalRole - User's global role
 * @param {string} permission - Permission to check
 */
const hasGlobalPermission = auth.hasGlobalPermission('admin', 'manage')

/**
 * Check if a user has a project-specific permission
 * @param {Object} projectRoles - User's project roles
 * @param {string} projectId - Project ID
 * @param {string} requiredPermission - Permission to check
 */
const hasProjectPermission = auth.checkProjectPermission(projectRoles, projectId, 'edit')

/**
 * Check if a project has a specific feature
 * @param {string} projectTier - Project's tier
 * @param {string} feature - Feature to check
 */
const hasProjectFeature = auth.checkProjectFeature('pro1', 'aiCopilot:5')

/**
 * Check if a user can perform a specific operation
 * @param {string} projectId - Project ID
 * @param {string} operation - Operation to check
 * @param {Object} options - Additional options
 */
const canPerformOperation = await auth.canPerformOperation(projectId, 'edit', { checkFeatures: true })

/**
 * Execute an action with permission check
 * @param {string} projectId - Project ID
 * @param {string} operation - Operation to check
 * @param {function} action - Action to execute
 */
await auth.withPermission(projectId, 'edit', () => {
  // Action to perform
})

/**
 * Get project access information
 * @param {string} projectId - Project ID
 */
const projectAccess = await auth.getProjectAccess(projectId)
```

### Socket Service
```javascript
const socket = sdk.getService('socket')

/**
 * Subscribe to events
 * @param {string} event - Event name
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
const unsubscribe = socket.subscribe('updates', (data) => {
  console.log('Received:', data)
})

/**
 * Send data
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
socket.send('update', {
  type: 'change',
  data: { ... }
})

// Cleanup
unsubscribe()
```

### Symstory Service
```javascript
const symstory = sdk.getService('symstory')

/**
 * Get data
 * @param {Object} query - Query object
 */
await symstory.getData(query)

/**
 * Update data
 * @param {Object} changes - Changes to apply
 */
await symstory.updateData(changes)

/**
 * Delete data
 * @param {string} path - Path to data
 */
await symstory.deleteData(path)

/**
 * Get an item
 * @param {string} type - Item type
 * @param {string} key - Item key
 */
await symstory.getItem(type, key)

/**
 * Add an item
 * @param {string} type - Item type
 * @param {Object} data - Item data
 */
await symstory.addItem(type, data)

/**
 * Update an item
 * @param {string} type - Item type
 * @param {Object} data - Item data
 */
await symstory.updateItem(type, data)

/**
 * Delete an item
 * @param {string} type - Item type
 * @param {string} key - Item key
 */
await symstory.deleteItem(type, key)

/**
 * Get branches
 */
await symstory.getBranches()

/**
 * Create a branch
 * @param {Object} branch - Branch data
 */
await symstory.createBranch(branch)

/**
 * Merge a branch
 * @param {Object} branch - Branch data
 */
await symstory.mergeBranch(branch)

/**
 * Restore a version
 * @param {Object} version - Version data
 */
await symstory.restoreVersion(version)
```

### Based Service
```javascript
const based = sdk.getService('based')

/**
 * Query data
 * @param {string} collection - Collection name
 * @param {Object} query - Query object
 */
const result = await based.query(collection, query)

/**
 * Subscribe to changes
 * @param {string} collection - Collection name
 * @param {Object} query - Query object
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
const unsubscribe = based.subscribe(collection, query, (data) => {
  console.log('Data updated:', data)
})

/**
 * Call a function
 * @param {string} functionName - Function name
 * @param {Object} params - Function parameters
 */
await based.call('functionName', params)

/**
 * Get a project
 * @param {string} projectId - Project ID
 */
await based.getProject(projectId)

/**
 * Create a project
 * @param {Object} projectData - Project data
 */
await based.createProject(projectData)

/**
 * Fetch a user
 * @param {string} userId - User ID
 */
await based.fetchUser(userId)

/**
 * Fetch a project
 * @param {string} projectId - Project ID
 */
await based.fetchProject(projectId)
```

### AI Service
```javascript
const ai = sdk.getService('ai')

/**
 * Prompt the AI
 * @param {string} query - Query string
 * @param {Object} options - Query options
 */
const response = await ai.prompt(query, options)
```

### Tracking Service (Grafana Faro)
```javascript
// 1) Initialize SDK with tracking config (early in app startup)
const sdk = new SDK({
  useNewServices: true,
  apiUrl: 'https://api.symbols.app',
  // Tracking configuration mirrors TrackingService options
  tracking: {
    url: 'https://<your-faro-receiver-url>', // FO ingest/collector URL
    appName: 'Symbols Platform',
    environment: 'development',              // 'production' | 'staging' | 'testing' | 'development'
    appVersion: '1.0.0',
    sessionTracking: true,
    enableTracing: true,                     // adds browser tracing when available
    globalAttributes: { region: 'us-east-1' }
  }
})
await sdk.initialize()

// 2) Get the tracking service
const tracking = sdk.getService('tracking')

// 3) Send signals
tracking.trackEvent('purchase', { amount: 42, currency: 'USD' })
tracking.trackMeasurement('cart_value', { value: 42 })
tracking.logError('checkout failed', { step: 'payment' })
tracking.trackView('Checkout', { stage: 'payment' })
tracking.setUser({ id: 'u_123', email: 'user@example.com' })
```

#### Configuration
Provide these under `tracking` when creating the `SDK` (or later via `tracking.configureTracking()`):

- `url` string: Frontend Observability/Faro ingestion URL. If omitted and no custom transports are provided, tracking is disabled.
- `appName` string: Logical application name used in Grafana dashboards.
- `appVersion` string: App version shown in Grafana.
- `environment` string: One of your environments; default resolves from runtime (`production`, `staging`, `testing`, `development`).
- `sessionTracking` boolean: Enable Faro session tracking. Default: `true`.
- `enableTracing` boolean: Enable web tracing and send to Tempo (if collector configured). Default: `true`.
- `globalAttributes` object: Key/values merged into every signal.
- `user` object: Initial user attributes.
- `maxQueueSize` number: Max queued calls before client setup. Default: `100`.
- `isolate` boolean: Create an isolated Faro instance.
- `transports` array | `transport` any: Custom transports (advanced).
- `instrumentations` array | `instrumentationsFactory(runtime) => Promise<array>` | `webInstrumentationOptions` object: Control Faro web instrumentations.

Note:
- Tracking is automatically disabled in non‑browser environments.
- Calls are queued until the Faro client is ready. For specific calls, pass `{ queue: false }` to skip queuing.

#### Method reference
The following methods are available via `sdk.getService('tracking')` and map to `utils/services.js`:

- `configureTracking(trackingOptions)` / `configure(trackingOptions)`: Merge/override runtime tracking options (supports all config keys above).
- `trackEvent(name, attributes?, options?)`
  - `name` string (required)
  - `attributes` object merged with global attributes
  - `options` object:
    - `domain` string | null
    - `queue` boolean (whether to queue if client not ready)
    - Additional transport options are forwarded to Faro
  - Example:
  ```javascript
  tracking.trackEvent('signup_attempt', { method: 'email' }, { domain: 'auth' })
  ```
- `trackError(error, options?)` / `captureException(error, options?)`
  - `error` Error | string
  - `options` can be:
    - object with Faro error options (`context`, `type`, `stackFrames`, `skipDedupe`, `timestampOverwriteMs`, etc.)
    - or a plain context object (shorthand)
    - `queue` boolean supported
  - Example:
  ```javascript
  tracking.trackError(new Error('Login failed'), { context: { screen: 'Login' } })
  ```
- `logMessage(message, level='info', context?)`
  - Convenience wrappers: `logDebug`, `logInfo`, `logWarning`/`logWarn`, `logErrorMessage`/`logError`
  - `message` string | string[]
  - `context` object merged with global attributes
  - Example:
  ```javascript
  tracking.logWarning('Slow response', { route: '/checkout', ttfbMs: 900 })
  ```
- `addBreadcrumb(message, attributes?)`
  - Adds a low‑cost breadcrumb via `trackEvent('breadcrumb', ...)`
  - Example:
  ```javascript
  tracking.addBreadcrumb('Open modal', { id: 'planLimits' })
  ```
- `trackMeasurement(type, values, options?)`
  - `type` string (required)
  - `values` object | number. If number, it becomes `{ value: <number> }`.
  - `options`:
    - `attributes` object (merged into payload.attributes)
    - `context` object (transport context)
    - `queue` boolean
    - Any additional transport options
  - Example:
  ```javascript
  tracking.trackMeasurement('cart_value', 42, { context: { currency: 'USD' } })
  ```
- `trackView(name, attributes?)`
  - Sets the current view/page in Faro
  - Example:
  ```javascript
  tracking.trackView('Dashboard', { section: 'Analytics' })
  ```
- `setUser(user, options?)` / `clearUser()`
  - `user` object with arbitrary attributes; supports `{ queue: boolean }`
  - Example:
  ```javascript
  tracking.setUser({ id: 'u_123', role: 'admin' })
  ```
- `setSession(session, options?)` / `clearSession()`
  - Attach custom session data; supports `{ queue: boolean, ...sessionOptions }`
- `setGlobalAttributes(attributes)` / `setGlobalAttribute(key, value)` / `removeGlobalAttribute(key)`
  - Manage the global attributes merged into every signal
- `flushQueue()`
  - Immediately runs all queued calls (no‑op if client not ready)
- `getClient()`
  - Returns the underlying Faro client (or `null` if not ready)
- `isEnabled()` / `isInitialized()`
  - Status helpers

#### Example: auth error tracking from services
The SDK’s services automatically send errors to tracking:
```javascript
try {
  await auth.login(email, password)
} catch (error) {
  // BaseService forwards details to tracking.trackError(...)
}
```

#### Visualizing in Grafana
- Use the Frontend Observability (Faro) data source and pick:
  - Service = your `appName`
  - Environment = your `environment`
- Panels for page loads and Web Vitals require web instrumentations and real page traffic.
- If self‑hosting with a Faro collector → Loki/Tempo, ensure the FO app is installed and the dashboard uses the FO data source; otherwise create custom panels with LogQL over Loki.

## Error Handling
```javascript
try {
  await sdk.initialize()
} catch (error) {
  console.error('SDK initialization failed:', error.message)
}
```

## Cleanup
```javascript
// Services are automatically cleaned up when SDK is destroyed
sdk.destroy()
```

## Configuration Options
```javascript
const options = {
  useNewServices: true,
  apiUrl: 'https://api.symbols.app',
  socketUrl: 'https://api.symbols.app',
  timeout: 30000,
  retryAttempts: 3,
  debug: false
}

const sdk = new SDK(options)
```

# Permissions System

## Quick Start

```javascript
// Check if user can edit a project
const canEdit = sdk.hasPermission(projectId, 'edit')

// Check if project has AI Copilot feature
const hasCopilot = sdk.checkProjectFeature(projectTier, 'aiCopilot')

// Check if user has global admin access
const isAdmin = sdk.hasGlobalPermission('admin', 'governance')
```

## Permission Types

### Core Permissions
| Permission | Use Case | Required Permissions | Features |
|------------|----------|---------------------|-----------|
| edit | Edit content | editMode, showCode | editMode |
| view | View content | showContent | canvasPages |
| design | Access design tools | editMode, showCode | accessToSymbolsLibrary |
| manage | Project settings | projectSettings, iam | workspaceAdministration |

### Version Control
| Permission | Use Case | Required Permissions | Features |
|------------|----------|---------------------|-----------|
| branch | Manage branches | versions | branching, versionHistory |
| merge | Merge changes | versions | branching |

### AI Features
| Permission | Use Case | Tier Limits |
|------------|----------|-------------|
| aiCopilot | AI assistance | Free: 3, Pro1: 5, Pro2: 15 |
| aiChatbot | Chat support | Free: 3, Pro1: 5, Pro2: 15 |

## Examples

### 1. Basic Permission Check
```javascript
const projectId = '123'
const canUserEdit = sdk.hasPermission(projectId, 'edit')

if (canUserEdit) {
  // Allow editing
  sdk.enableEditMode()
} else {
  // Show view-only mode
  sdk.enableViewMode()
}
```

### 2. Feature Access by Tier
```javascript
// Check AI feature access
const projectTier = 'pro1'
const copilotTokens = sdk.checkProjectFeature(projectTier, 'aiCopilot')

if (copilotTokens) {
  console.log(`User has access to ${copilotTokens} AI tokens`)
} else {
  console.log('No AI access available')
}
```

### 3. Role-Based Access
```javascript
// Admin checking multiple permissions
const isProjectAdmin = sdk.checkProjectPermission(
  userRoles,
  projectId,
  'admin'
)

if (isProjectAdmin) {
  // Can access admin features
  const canInvite = sdk.hasPermission(projectId, 'invite')
  const canManage = sdk.hasPermission(projectId, 'manage')
}
```

### 4. Complex Permission Scenarios
```javascript
// Check if user can perform branch merge
const canMerge = projectId => {
  const hasPermission = sdk.hasPermission(projectId, 'merge')
  const isProtectedBranch = sdk.getBranchProtection(projectId)

  if (isProtectedBranch) {
    return hasPermission && sdk.hasPermission(projectId, 'manage')
  }

  return hasPermission
}
```

## Role Permissions

### Global Roles
```javascript
const ROLE_PERMISSIONS = {
  guest: ['viewPublicProjects'],
  user: ['viewPublicProjects', 'createProject'],
  admin: ['viewPublicProjects', 'createProject', 'governance'],
  superAdmin: ['viewPublicProjects', 'createProject', 'governance', 'managePlatform']
}
```

### Project Roles
```javascript
const PROJECT_ROLE_PERMISSIONS = {
  guest: ['platformSettings', 'showContent'],
  editor: ['platformSettings', 'showContent', 'showCode', 'editMode', 'versions'],
  admin: [
    // Editor permissions +
    'inviteMembers',
    'branchProtection',
    'projectSettings'
  ],
  owner: [
    // Admin permissions +
    'copyPasteAllowanceSetting',
    'iam'
  ]
}
```

## Common Use Cases

1. **Creating New Project**
```javascript
if (sdk.hasGlobalPermission(userRole, 'createProject')) {
  const projectId = await sdk.createProject()
  await sdk.assignUserRole(userId, projectId, 'owner')
}
```

2. **Inviting Team Members**
```javascript
const canInvite = sdk.hasPermission(projectId, 'invite')
if (canInvite) {
  const tier = sdk.getProjectTier(projectId)
  const maxMembers = TIER_LIMITS[tier].teamMembers
  const currentSize = await sdk.getCurrentTeamSize()

  if (currentSize < maxMembers) {
    await sdk.inviteTeamMember(email, 'editor')
  }
}
```

3. **Managing AI Features**
```javascript
const handleAIFeature = async (projectId) => {
  const tier = await sdk.getProjectTier(projectId)
  const copilotAccess = sdk.checkProjectFeature(tier, 'aiCopilot')

  if (copilotAccess) {
    const tokensLeft = await sdk.getAITokensRemaining(projectId)
    return {
      hasAccess: true,
      tokens: tokensLeft,
      maxTokens: copilotAccess
    }
  }

  return { hasAccess: false }
}
```

4. **Branch Protection**
```javascript
const protectBranch = async (projectId, branchName) => {
  const canManage = sdk.hasPermission(projectId, 'manage')
  if (!canManage) return false

  return sdk.setBranchProtection(projectId, branchName, {
    requireReview: true,
    requiredApprovals: 2,
    enforceAdminReview: true
  })
}
```

## Error Handling

```javascript
try {
  const hasAccess = await sdk.hasPermission(projectId, 'edit')
  if (!hasAccess) {
    throw new Error('PERMISSION_DENIED')
  }
  await sdk.editProject(projectId)
} catch (error) {
  switch (error.code) {
    case 'PERMISSION_DENIED':
      console.error('User lacks required permissions')
      break
    case 'TIER_LIMIT_EXCEEDED':
      console.error('Upgrade required for this feature')
      break
    default:
      console.error('Unexpected error:', error)
  }
}
```

## Token Management

The SDK now includes automatic token management with persistence and refresh capabilities:

### Features
- **Automatic Token Refresh**: Tokens are refreshed automatically before expiration
- **Persistent Storage**: Tokens persist across page refreshes using localStorage
- **Secure Handling**: Automatic cleanup on logout and error handling
- **Flexible Storage**: Supports localStorage, sessionStorage, or memory storage

### Configuration
```javascript
import { getTokenManager } from '@symbols/sdk'

// Configure token management (optional - handled automatically by CoreService)
const tokenManager = getTokenManager({
  storageType: 'localStorage', // 'localStorage' | 'sessionStorage' | 'memory'
  refreshBuffer: 60 * 1000, // Refresh 1 minute before expiry
  apiUrl: '/api',
  onTokenRefresh: (tokens) => console.log('Token refreshed'),
  onTokenExpired: () => console.log('Session expired'),
  onTokenError: (error) => console.error('Token error:', error)
})
```

### Usage with CoreService
```javascript
// Initialize SDK - token management is automatic
const symbols = new Symbols({
  appKey: 'your-app-key',
  authToken: 'your-initial-token' // Optional
})

// Login - tokens are automatically managed
const loginResult = await symbols.login('user@example.com', 'password')

// All subsequent API calls automatically use fresh tokens
const projects = await symbols.getProjects()
const projectData = await symbols.getProjectData('projectId123')

// Logout - tokens are automatically cleared
await symbols.logout()
```

## New Core Service Methods

### Project Data Management (Symstory Replacement)
```javascript
// Apply changes to project
await symbols.applyProjectChanges('projectId', [
  ['update', ['components', 'Button'], { color: 'blue' }],
  ['delete', ['pages', 'oldPage']]
], { message: 'Update button color', type: 'patch' })

// Get current project data
const projectData = await symbols.getProjectData('projectId', {
  branch: 'main',
  includeHistory: true
})

// Restore to previous version
await symbols.restoreProjectVersion('projectId', '1.2.0', {
  message: 'Rollback to stable version'
})

// Helper methods for single operations
await symbols.updateProjectItem('projectId', ['components', 'Button'], { color: 'red' })
await symbols.deleteProjectItem('projectId', ['pages', 'unused'])
await symbols.setProjectValue('projectId', ['settings', 'theme'], 'dark')
```

### Pull Request Management
```javascript
// Create pull request
const pr = await symbols.createPullRequest('projectId', {
  source: 'feature/new-ui',
  target: 'main',
  title: 'Add new UI components',
  description: 'Modern UI overhaul'
})

// List pull requests
const { pullRequests, pagination } = await symbols.listPullRequests('projectId', {
  status: 'open',
  page: 1,
  limit: 10
})

// Review pull request
await symbols.approvePullRequest('projectId', 'pr_123', 'Great work!')

// Request changes
await symbols.requestPullRequestChanges('projectId', 'pr_123', [
  {
    file: 'src/Button.js',
    line: 25,
    comment: 'Add error handling',
    type: 'issue'
  }
])

// Merge pull request
await symbols.mergePullRequest('projectId', 'pr_123')

// Get diff
const diff = await symbols.getPullRequestDiff('projectId', 'pr_123')
```

### Branch Management
```javascript
// List branches
const branches = await symbols.listBranches('projectId')

// Create branch
await symbols.createFeatureBranch('projectId', 'user authentication')
// Creates: 'feature/user-authentication'

// Check branch status
const status = await symbols.getBranchStatus('projectId', 'feature/new-ui')

// Preview merge
const preview = await symbols.previewMerge('projectId', 'feature/new-ui', 'main')
if (preview.data.conflicts.length === 0) {
  // Commit merge if no conflicts
  await symbols.commitMerge('projectId', 'feature/new-ui', {
    message: 'Add new UI features',
    type: 'minor'
  })
}

// Delete branch safely
await symbols.deleteBranchSafely('projectId', 'feature/old-feature')

// Publish version
await symbols.publishVersion('projectId', {
  version: '1.2.0',
  branch: 'main'
})
```

## Error Handling

The SDK provides comprehensive error handling for all scenarios:

```javascript
try {
  await symbols.mergePullRequest('projectId', 'pr_123')
} catch (error) {
  if (error.message.includes('conflicts')) {
    // Handle merge conflicts
    console.log('Manual conflict resolution required')
  } else if (error.message.includes('403')) {
    // Handle permission errors
    console.log('Insufficient permissions')
  } else {
    // Handle other errors
    console.error('Operation failed:', error.message)
  }
}
```



