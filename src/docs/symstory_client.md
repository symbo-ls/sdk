# Symstory Client — DEPRECATED

`@symbo.ls/symstory-utils` and the standalone Symstory client are no longer
part of `@symbo.ls/sdk`. Project data versioning, branching, and version
restoration now live on `ProjectService` and `BranchService`.

## Mapping from old Symstory API

| Symstory v3 | v4 location |
| --- | --- |
| `Symstory.init(appKey, { apiUrl })` | `new SDK({ apiUrl })` then `sdk.initialize({ authToken, appKey })` |
| `client.get(query, branch, version)` | `sdk.getProjectData(projectId, { branch, version })` (or `sdk.getProjectItemByPath`) |
| `client.set(path, value)` | `sdk.setProjectValue(projectId, path, value, options)` |
| `client.update(changes, opts)` | `sdk.applyProjectChanges(projectId, changes, opts)` |
| `client.getBranches()` | `sdk.listBranches(projectId)` |
| `client.createBranch(name, opts)` | `sdk.createBranch(projectId, { name, source, message, version })` |
| `client.mergeBranch(target, opts)` | `sdk.mergeBranch(projectId, branchName, mergeData)` |
| `client.restoreVersion(version, opts)` | `sdk.restoreProjectVersion(projectId, version, options)` |

## Migration example

```js
// v3 — Symstory standalone
import Symstory from '@symbo.ls/symstory-utils'
const client = Symstory.init('your-app-key', { apiUrl: 'https://...' })
await client.update([['update', 'path.to.value', 'updatedValue']])
await client.createBranch('feature-x', { message: 'feature start' })

// v4 — SDK
import { SDK } from '@symbo.ls/sdk'
const sdk = new SDK({ apiUrl: 'https://...' })
await sdk.initialize({ authToken })
await sdk.applyProjectChanges(projectId, [
  ['update', ['path', 'to', 'value'], 'updatedValue']
], { message: 'change', type: 'patch' })
await sdk.createBranch(projectId, { name: 'feature-x', message: 'feature start' })
```

For the full v4 API, see [`README.md`](../../README.md) and
[`SDK_FOR_MCP.md`](../../SDK_FOR_MCP.md).
