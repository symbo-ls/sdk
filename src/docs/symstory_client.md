# Symstory Client

The Symstory Client provides methods to interact with the Symstory service. Below is a description of all available methods.

## Initialization

To initialize the Symstory Client, use the `init` method:

```javascript
import Symstory from '@symbo.ls/symstory-utils';

const client = Symstory.init('your-app-key', { apiUrl: 'https://your-custom-url' });
```

## Methods

### `get(query, branch = null, version = null)`

Fetch project data based on the provided query, branch, and version.

- `query`: The query object to filter data.
- `branch`: The branch name (optional).
- `version`: The version number (optional).

### `set(path, value)`

Set a value at the specified path.

- `path`: The path where the value should be set.
- `value`: The value to set.

### `update(changes, { type = 'patch', message = '', branch = 'main' } = {})`

Update project data with the provided changes.

- `changes`: The changes to apply.
- `type`: The type of update (default: 'patch').
- `message`: A message describing the update (optional).
- `branch`: The branch name (default: 'main').

### `getBranches()`

Retrieve all branches of the project.

### `createBranch(branch, { message, source = 'main', version } = {})`

Create a new branch.

- `branch`: The name of the new branch.
- `message`: A message describing the branch creation (optional).
- `source`: The source branch (default: 'main').
- `version`: The version number (optional).

### `mergeBranch(target, { message, source = 'main', type = 'patch', version, commit = 'false', changes } = {})`

Merge a branch into the target branch.

- `target`: The target branch.
- `message`: A message describing the merge (optional).
- `source`: The source branch (default: 'main').
- `type`: The type of merge (default: 'patch').
- `version`: The version number (optional).
- `commit`: Whether to commit the merge (default: 'false').
- `changes`: The changes to apply during the merge (optional).

### `restoreVersion(version, { branch = 'main', type = 'patch', message } = {})`

Restore an older version of the project.

- `version`: The version number to restore.
- `branch`: The branch name (default: 'main').
- `type`: The type of restore (default: 'patch').
- `message`: A message describing the restore (optional).

## Example Usage

```javascript
(async () => {
  const client = Symstory.init('your-app-key');

  // Fetch data
  const data = await client.get({ key: 'value' });

  // Set data
  await client.set('path.to.value', 'newValue');

  // Update data
  await client.update([['update', 'path.to.value', 'updatedValue']]);

  // Get branches
  const branches = await client.getBranches();

  // Create a new branch
  await client.createBranch('new-branch', { message: 'Creating new branch' });

  // Merge branches
  await client.mergeBranch('target-branch', { source: 'new-branch', message: 'Merging branches' });

  // Restore a version
  await client.restoreVersion('1.0.0', { message: 'Restoring version 1.0.0' });
})();
```
