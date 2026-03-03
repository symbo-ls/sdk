I'll help write the SDK usage documentation focusing on the key services and their methods.

```markdown:packages/sdk/src/docs/sdk_usage.md
# SDK Usage Documentation

## Table of Contents
- [Installation](#installation)
- [Initialization](#initialization)
- [Service Methods](#service-methods)
  - [Auth Service](#auth-service)
  - [Symstory Service](#symstory-service)
- [Advanced Usage](#advanced-usage)

## Installation

```bash
npm install @symbo.ls/sdk
```

## Initialization

```javascript
import { SDK } from '@symbo.ls/sdk'

// Initialize with all services (default)
const sdk = new SDK({
  appKey: 'your-app-key',
  authToken: 'optional-auth-token'
})

// Initialize with specific services only
const sdk = new SDK({
  appKey: 'your-app-key',
  services: ['auth', 'symstory']  // Only include auth and symstory services
})

// Initialize the SDK
await sdk.initialize()
```

## Service Methods

The SDK provides direct access to service methods through proxy methods. You can call service methods directly on the SDK instance without explicitly accessing the service object.

### Auth Service

Authentication and authorization methods:

```javascript
// Login
const response = await sdk.login('email@example.com', 'password')

// Register
await sdk.register({
  email: 'email@example.com',
  password: 'password',
  name: 'User Name'
})

// Logout
await sdk.logout()

// Project Members Management
await sdk.getProjectMembers('project-id')
await sdk.inviteMember('project-id', 'email@example.com', 'editor', 'Member Name')
await sdk.updateMemberRole('project-id', 'user-id', 'admin')

// Permission Checking
const hasPermission = sdk.hasPermission('project-id', 'edit:content')

// Project Access
const access = await sdk.getProjectAccess('project-id')

// Password Management
await sdk.requestPasswordReset('email@example.com')
await sdk.confirmPasswordReset('reset-token', 'new-password')
```

### Symstory Service

Data management and versioning:

```javascript
// Data Operations
const data = await sdk.getData({
  $find: {
    $traverse: 'children',
    $filter: [/* your filters */]
  }
}, {
  branch: 'main',
  version: 'optional-version',
  bypassCache: false
})

// Item Operations
await sdk.addItem('content', {
  key: 'page-1',
  value: { title: 'Page 1' },
  schema: { type: 'page' }
})

await sdk.updateItem('content', {
  key: 'page-1',
  value: { title: 'Updated Page 1' }
})

await sdk.deleteItem('content', 'page-1')

// Branch Management
const branches = await sdk.getBranches()
await sdk.createBranch('feature-branch')
await sdk.mergeBranch('feature-branch')

// Version Management
await sdk.restoreVersion('version-id')
```

## Advanced Usage

### Error Handling

All SDK methods throw errors with descriptive messages. It's recommended to use try-catch blocks:

```javascript
try {
  await sdk.addItem('content', {
    key: 'new-page',
    value: { title: 'New Page' }
  })
} catch (error) {
  console.error('Failed to add item:', error.message)
}
```

### Caching

The Symstory service includes built-in caching for getData operations:

```javascript
// Using cache (default)
const data = await sdk.getData(query)

// Bypass cache
const freshData = await sdk.getData(query, { bypassCache: true })

// Clear cache
sdk.clearCache()
```

### Service Status

You can check the status of services:

```javascript
// Check if SDK is ready
const isReady = sdk.isReady()

// Get detailed status
const status = sdk.getStatus()
```

### Context Updates

The SDK maintains a context that can be updated:

```javascript
sdk.updateContext({
  authToken: 'new-token'
})
```
