# SDK Usage

This document is a thin entry point. The full reference now lives elsewhere:

- [`README.md`](../../README.md) — installation, every service, examples
- [`SDK_FOR_MCP.md`](../../SDK_FOR_MCP.md) — full machine-readable surface
  for MCP servers and automation agents
- [`FeatureFlags.md`](./FeatureFlags.md) — feature-flag scenarios

## Quick start

```js
import { SDK } from '@symbo.ls/sdk'

const sdk = new SDK({
  apiUrl: 'https://next.api.symbols.app',
  socketUrl: 'https://next.api.symbols.app',
  debug: false
})

await sdk.initialize({
  authToken: 'your-jwt-token',
  state: rootState // required only if you call sdk.getService('collab').connect()
})
```

## Service access

Two equivalent patterns:

```js
sdk.getService('project').getProject(id)   // explicit
sdk.getProject(id)                          // proxy method
```

The proxy table lives in [`src/utils/services.js`](../utils/services.js) — it
maps every public method to its owning service.

## Available services

`auth`, `collab`, `project`, `plan`, `subscription`, `file`, `payment`,
`dns`, `branch`, `pullRequest`, `admin`, `screenshot`, `tracking`,
`waitlist`, `metrics`, `integration`, `featureFlag`, `organization`,
`workspace`, `workspaceData`, `kv`, `allocationRule`, `sharedAsset`,
`credits`.

See [`README.md`](../../README.md#services) for per-service method lists or
[`SDK_FOR_MCP.md`](../../SDK_FOR_MCP.md) for the full canonical reference.

## Project data versioning

Project data mutations (formerly `Symstory`) live on `ProjectService`:

```js
await sdk.applyProjectChanges(projectId, [
  ['update', ['components', 'Button'], { color: 'blue' }],
  ['delete', ['pages', 'old']]
], { message: 'Update button', type: 'patch' })

await sdk.getProjectData(projectId, options)
await sdk.getProjectVersions(projectId, options)
await sdk.restoreProjectVersion(projectId, version, options)
await sdk.updateProjectItem(projectId, path, value, options)
await sdk.deleteProjectItem(projectId, path, options)
await sdk.setProjectValue(projectId, path, value, options)
await sdk.addProjectItems(projectId, items, options)
await sdk.getProjectItemByPath(projectId, path, options)
```

## Branches

```js
await sdk.listBranches(projectId)
await sdk.createBranch(projectId, branchData)
await sdk.mergeBranch(projectId, branchName, mergeData)
await sdk.publishVersion(projectId, publishData)
```

Full branch helpers — `createFeatureBranch`, `createHotfixBranch`,
`previewMerge`, `commitMerge`, `getBranchStatus`, etc. — are documented
in [`README.md#branch-service`](../../README.md#branch-service).

## Status & context

```js
sdk.isReady()                      // boolean
sdk.getStatus()                    // { ready, services, context }
sdk.updateContext({ authToken })   // propagates to every service
await sdk.destroy()                // tear down
```

## Error handling

All methods throw descriptive errors. Wrap calls accordingly:

```js
try {
  await sdk.applyProjectChanges(projectId, changes)
} catch (error) {
  console.error('Apply failed:', error.message, error.cause)
}
```
