# CoreService

The CoreService provides integration with the new core service APIs, replacing most functionality previously handled by BasedService. It offers a comprehensive set of methods for authentication, user management, project management, file handling, payments, and DNS management.

## Features

- **Authentication**: Login, registration, OAuth, password management
- **User Management**: Profile management, user queries
- **Project Management**: CRUD operations, member management, settings
- **File Management**: File uploads, project icons
- **Payment Integration**: Stripe checkout, subscription management
- **DNS Management**: Domain records, project domain setup
- **Library Management**: Project libraries and dependencies

## Usage

### Basic Setup

```javascript
import { createCoreService } from '@symbols/sdk'

// Create and initialize the service
const coreService = createCoreService({
  context: {
    authToken: 'your-jwt-token', // Optional for public methods
    appKey: 'your-app-key'
  }
})

await coreService.init({ context: coreService._context })
```

### Authentication

```javascript
// Register a new user
const user = await coreService.register({
  name: 'John Doe',
  email: 'john@example.com',
  password: 'securePassword123'
})

// Login
const loginResponse = await coreService.login('john@example.com', 'securePassword123')
console.log('Auth token:', loginResponse.token)

// OAuth authentication
const googleResponse = await coreService.googleAuth(googleAuthCode)
const githubResponse = await coreService.githubAuth(githubAuthCode)

// Password reset
await coreService.requestPasswordReset('john@example.com')
await coreService.confirmPasswordReset(resetToken, 'newPassword123')

// Get current user
const currentUser = await coreService.getMe()
```

### User Management

```javascript
// Get user profile
const profile = await coreService.getUserProfile()

// Update user profile
await coreService.updateUserProfile({
  name: 'John Smith',
  username: 'johnsmith'
})

// Get user's projects
const projects = await coreService.getUserProjects()

// Get user by ID or email
const user = await coreService.getUser(userId)
const userByEmail = await coreService.getUserByEmail('john@example.com')
```

### Project Management

```javascript
// Create a new project
const project = await coreService.createProject({
  name: 'My New Project',
  projectType: 'web',
  framework: 'react',
  visibility: 'private'
})

// Get projects
const allProjects = await coreService.getProjects()
const specificProject = await coreService.getProject(projectId)
const projectByKey = await coreService.getProjectByKey('my-project-key')

// Update project
await coreService.updateProject(projectId, {
  name: 'Updated Project Name',
  settings: { theme: 'dark' }
})

// Update specific project aspects
await coreService.updateProjectComponents(projectId, newComponents)
await coreService.updateProjectSettings(projectId, newSettings)
await coreService.updateProjectName(projectId, 'New Name')

// Duplicate and remove projects
const duplicatedProject = await coreService.duplicateProject(projectId, 'Copy of Project')
await coreService.removeProject(projectId)

// Check project key availability
const isAvailable = await coreService.checkProjectKeyAvailability('new-project-key')
```

### Project Member Management

```javascript
// Get project members
const members = await coreService.getProjectMembers(projectId)

// Invite a member (note: message parameter comes before role)
await coreService.inviteMember(projectId, 'user@example.com', 'Welcome to the project!', 'editor')

// Accept invitation
await coreService.acceptInvite(projectId, invitationToken)

// Update member role
await coreService.updateMemberRole(projectId, memberId, 'admin')

// Remove member
await coreService.removeMember(projectId, memberId)
```

### File Management

```javascript
// Upload a file
const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]

const uploadResult = await coreService.uploadFile(file, {
  projectId: 'project-123',
  tags: ['image', 'avatar'],
  visibility: 'public'
})

// Update project icon
const iconFile = document.querySelector('#icon-input').files[0]
await coreService.updateProjectIcon(projectId, iconFile)
```

### Payment Integration

```javascript
// Create checkout session
const checkoutSession = await coreService.checkout({
  projectId: 'project-123',
  seats: 5,
  price: 'growth_monthly',
  successUrl: 'https://myapp.com/success',
  cancelUrl: 'https://myapp.com/pricing'
})

// Redirect to Stripe checkout
window.location.href = checkoutSession.url

// Get subscription status
const subscription = await coreService.getSubscriptionStatus(projectId)
```

### DNS Management

```javascript
// Create DNS record
await coreService.createDnsRecord('example.com', {
  type: 'CNAME',
  content: 'target.example.com',
  proxied: true
})

// Get DNS record
const dnsRecord = await coreService.getDnsRecord('example.com')

// Remove DNS record
await coreService.removeDnsRecord('example.com')
```

### Library Management

```javascript
// Get available libraries
const libraries = await coreService.getAvailableLibraries({
  page: 1,
  limit: 20,
  search: 'react',
  framework: 'react'
})

// Get project libraries
const projectLibraries = await coreService.getProjectLibraries(projectId)

// Add libraries to project
await coreService.addProjectLibraries(projectId, ['lib1', 'lib2'])

// Remove libraries from project
await coreService.removeProjectLibraries(projectId, ['lib1'])
```

### Error Handling

All methods throw descriptive errors that can be caught and handled:

```javascript
try {
  await coreService.login('invalid@email.com', 'wrongpassword')
} catch (error) {
  console.error('Login failed:', error.message)
  // Handle specific error cases
  if (error.message.includes('Invalid credentials')) {
    // Show login error to user
  }
}
```

### Service Status

```javascript
// Check if service is ready
if (coreService.isReady()) {
  // Service is initialized and ready to use
}

// Get service status
const status = coreService.getStatus()
console.log('Service ready:', status.ready)
console.log('Service error:', status.error)

// Get health status from server
const health = await coreService.getHealthStatus()
```

## Migration from BasedService

If you're migrating from BasedService, most method names remain the same, but the underlying implementation now uses REST APIs instead of Based.io. Key differences:

1. **Authentication**: Now uses JWT tokens instead of Based.io auth state
2. **File uploads**: Now uses FormData instead of Based.io streams
3. **Error handling**: More consistent HTTP-based error responses
4. **Initialization**: Simpler setup without Based.io configuration

## Environment Configuration

The service automatically uses the correct API URL based on your environment configuration in `environment.js`. Make sure your environment has the `apiUrl` configured properly.

## Rate Limits

The core service implements rate limiting:
- **Default**: 300 requests per 15 minutes
- **Auth**: 15 requests per 15 minutes
- **API**: 150 requests per 5 minutes

Plan your API usage accordingly and implement proper error handling for rate limit responses.