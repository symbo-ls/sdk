# CoreService — DEPRECATED

`CoreService` and `createCoreService` were the v3 monolith. They no longer
exist. Functionality has been split into focused services:

| v3 method | v4 service | v4 method |
| --- | --- | --- |
| `coreService.register(...)` | `auth` | `register(...)` |
| `coreService.login(...)` | `auth` | `login(...)` |
| `coreService.logout(...)` | `auth` | `logout(...)` |
| `coreService.googleAuth(...)` | `auth` | `googleAuth(...)` |
| `coreService.githubAuth(...)` | `auth` | `githubAuth(...)` |
| `coreService.requestPasswordReset(...)` | `auth` | `requestPasswordReset(...)` |
| `coreService.confirmPasswordReset(...)` | `auth` | `confirmPasswordReset(...)` |
| `coreService.getMe()` | `auth` | `getMe()` |
| `coreService.getUserProfile()` | `auth` | `getUserProfile()` |
| `coreService.updateUserProfile(...)` | `auth` | `updateUserProfile(...)` |
| `coreService.getUserProjects()` | `auth` | `getUserProjects()` |
| `coreService.getUser(id)` | `auth` | `getUser(id)` |
| `coreService.getUserByEmail(email)` | `auth` | `getUserByEmail(email)` |
| `coreService.createProject(...)` | `project` | `createProject(...)` |
| `coreService.getProjects(...)` | `project` | `getProjects(...)` |
| `coreService.getProject(id)` | `project` | `getProject(id)` |
| `coreService.getProjectByKey(key)` | `project` | `getProjectByKey(key)` |
| `coreService.updateProject(...)` | `project` | `updateProject(...)` |
| `coreService.duplicateProject(...)` | `project` | `duplicateProject(...)` |
| `coreService.removeProject(id)` | `project` | `removeProject(id)` |
| `coreService.checkProjectKeyAvailability(key)` | `project` | `checkProjectKeyAvailability(key)` |
| `coreService.getProjectMembers(id)` | `project` | `getProjectMembers(id)` |
| `coreService.inviteMember(id, email, msg, role)` | `project` | `inviteMember(id, email, role, options)` ⚠ signature changed |
| `coreService.acceptInvite(id, token)` | `project` | `acceptInvite(token)` ⚠ signature changed |
| `coreService.updateMemberRole(...)` | `project` | `updateMemberRole(...)` |
| `coreService.removeMember(...)` | `project` | `removeMember(...)` |
| `coreService.uploadFile(...)` | `file` | `uploadFile(...)` |
| `coreService.updateProjectIcon(...)` | `file` | `updateProjectIcon(...)` |
| `coreService.checkout(...)` | `payment` | `checkout(...)` |
| `coreService.getSubscriptionStatus(id)` | `payment` / `subscription` | `getSubscriptionStatus(id)` / `getProjectStatus(id)` |
| `coreService.createDnsRecord(...)` | `dns` | `createDnsRecord(...)` |
| `coreService.getDnsRecord(domain)` | `dns` | `getDnsRecord(domain)` |
| `coreService.removeDnsRecord(domain)` | `dns` | `removeDnsRecord(domain)` |
| `coreService.getAvailableLibraries(...)` | `project` | `getAvailableLibraries(...)` |
| `coreService.getProjectLibraries(id)` | `project` | `getProjectLibraries(id)` |
| `coreService.addProjectLibraries(...)` | `project` | `addProjectLibraries(...)` |
| `coreService.removeProjectLibraries(...)` | `project` | `removeProjectLibraries(...)` |

## Migration

```js
// v3
import { createCoreService } from '@symbo.ls/sdk'
const core = createCoreService({ context: { authToken } })
await core.init({ context: { authToken } })
await core.login(email, password)
const project = await core.getProject(id)

// v4
import { SDK } from '@symbo.ls/sdk'
const sdk = new SDK()
await sdk.initialize({ authToken })
await sdk.login(email, password)
const project = await sdk.getProject(id)
```

For the full v4 API, see [`README.md`](../../README.md) and
[`SDK_FOR_MCP.md`](../../SDK_FOR_MCP.md).

## Notes on signature changes

- `inviteMember(projectId, email, role, options)` — the `message` parameter
  was removed; pass it inside `options` if needed.
- `acceptInvite(token)` — single argument; `projectId` was redundant since
  the token encodes it.
- File uploads: `getFileUrl` and `validateFile` are now sync helpers on the
  `file` service, not async.
- `getHealthStatus` (v3) is no longer part of the SDK — health checks are
  exposed via the platform observability stack, not the SDK.

## Rate limits

Rate limits are enforced server-side. As of v4:
- **Default**: 300 requests / 15 minutes
- **Auth**: 15 requests / 15 minutes
- **API**: 150 requests / 5 minutes

Use `sdk.getService('admin').getRateLimitStats()` (admin-only) to inspect
current quotas.
