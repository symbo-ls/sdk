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
  socket: {
    socketUrl: 'wss://your-socket-url',
  },
  symstory: {
    appKey: 'your-symstory-key',
  }
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
