import config from '../config/environment.js'

const DEFAULT_OPTIONS = {
  apiUrl: config.apiUrl
}

class SymstoryClient {
  /**
   * Creates an instance of SymstoryClient.
   * @param {string} appKey - The application key.
   * @param {object} [options={}] - The options for the client.
   */
  constructor (appKey, options = {}) {
    if (!appKey) {
      throw new Error('AppKey is required')
    }
    this.appKey = appKey
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.headers = {
      'Content-Type': 'application/json',
      ...this.options.headers,
      'X-AppKey': appKey
    }
  }

  /**
   * Makes a request to the Symstory service.
   * @param {string} [path=''] - The request path.
   * @param {object} [options={}] - The request options.
   * @returns {Promise<any>} - The response data.
   */
  async request (path = '', options = {}) {
    const url = `${this.options.apiUrl}/symstory/${this.appKey}${path}`
    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || error.error || 'Request failed')
    }

    return response.status === 204 ? null : response.json()
  }

  /**
   * Fetches project data.
   * @param {object} query - The query object to filter data.
   * @param {string|null} [branch=null] - The branch name.
   * @param {string|null} [version=null] - The version number.
   * @returns {Promise<any>} - The project data.
   */
  get (query, branch = null, version = null) {
    const params = new URLSearchParams({
      ...(branch && { branch }),
      ...(version ? { version } : { cacheId: Math.random() }),
      ...(query && { query: JSON.stringify(query) })
    })
    return this.request(`?${params}`)
  }

  /**
   * Sets a value at the specified path.
   * @param {string} path - The path where the value should be set.
   * @param {any} value - The value to set.
   * @returns {Promise<any>} - The response data.
   */
  set (path, value) {
    return this.request('', {
      method: 'POST',
      body: JSON.stringify({ changes: [['update', path, value]] })
    })
  }

  /**
   * Updates project data.
   * @param {Array} changes - The changes to apply.
   * @param {object} [options={}] - The update options.
   * @param {string} [options.type='patch'] - The type of update.
   * @param {string} [options.message=''] - A message describing the update.
   * @param {string} [options.branch='main'] - The branch name.
   * @returns {Promise<any>} - The response data.
   */
  async update (
    changes,
    { type = 'patch', message = '', branch = 'main' } = {}
  ) {
    return await this.request('', {
      method: 'POST',
      body: JSON.stringify({ changes, type, message, branch })
    })
  }

  /**
   * Retrieves all branches of the project.
   * @returns {Promise<any>} - The branches data.
   */
  getBranches () {
    return this.request('/branches')
  }

  /**
   * Creates a new branch.
   * @param {string} branch - The name of the new branch.
   * @param {object} [options={}] - The branch creation options.
   * @param {string} [options.message] - A message describing the branch creation.
   * @param {string} [options.source='main'] - The source branch.
   * @param {string} [options.version] - The version number.
   * @returns {Promise<any>} - The response data.
   */
  createBranch (branch, { message, source = 'main', version } = {}) {
    return this.request('/branch', {
      method: 'POST',
      body: JSON.stringify({ branch, message, source, version })
    })
  }

  /**
   * Edit an existing branch. (For now only supports branch renaming)
   * @param {string} branch - The current name of the branch to edit.
   * @param {object} [options={}] - The branch edit options.
   * @param {string} [options.name] - New name for the branch
   * @returns {Promise<any>} - The response data.
   */
  editBranch (branch, { name } = {}) {
    return this.request('/branch', {
      method: 'PATCH',
      body: JSON.stringify({ branch, name })
    })
  }

  /**
   * Delete an existing branch.
   * @param {string} branch - The name of the branch to delete.
   * @returns {Promise<any>} - The response data.
   */
  deleteBranch (branch) {
    return this.request('/branch', {
      method: 'DELETE',
      body: JSON.stringify({ branch })
    })
  }

  /**
   * Merges a branch into the target branch.
   * @param {string} target - The target branch.
   * @param {object} [options={}] - The merge options.
   * @param {string} [options.message] - A message describing the merge.
   * @param {string} [options.source='main'] - The source branch.
   * @param {string} [options.type='patch'] - The type of merge.
   * @param {string} [options.version] - The version number.
   * @param {boolean} [options.commit='false'] - Whether to commit the merge.
   * @param {Array} [options.changes] - The changes to apply during the merge.
   * @returns {Promise<any>} - The response data.
   */
  mergeBranch (
    target,
    {
      message,
      source = 'main',
      type = 'patch',
      version,
      commit = 'false',
      changes
    } = {}
  ) {
    return this.request('/merge', {
      method: 'POST',
      body: JSON.stringify({
        target,
        source,
        message,
        type,
        version,
        commit,
        changes
      })
    })
  }

  /**
   * Restores an older version of the project.
   * @param {string} version - The version number to restore.
   * @param {object} [options={}] - The restore options.
   * @param {string} [options.branch='main'] - The branch name.
   * @param {string} [options.type='patch'] - The type of restore.
   * @param {string} [options.message] - A message describing the restore.
   * @returns {Promise<any>} - The response data.
   */
  restoreVersion (version, { branch = 'main', type = 'patch', message } = {}) {
    return this.request('/restore', {
      method: 'POST',
      body: JSON.stringify({ branch, version, type, message })
    })
  }

  /**
   * Publishes an existing version of the project.
   * @param {string} version - The version ID/number to publish.
   * @param {object} [options={}] - The publishing options.
   * @param {string} [options.branch='main'] - The branch name. (Only if version number is provided)
   * @returns {Promise<any>} - The response data.
   */
  publishVersion (version) {
    return this.request('/publish', {
      method: 'POST',
      body: JSON.stringify({ version })
    })
  }

  /**
   * Retrieves all changes after a specific version.
   * @param {object} [options={}] - The changes options.
   * @param {string} [options.versionId] - The version ID to publish.
   * @param {string} [options.versionValue] - The version ID to publish. (alternative to versionId)
   * @param {string} [options.branch] - The branch to publish (Only in combination to versionValue)
   * @returns {Promise<any>} - The changes data.
   */
  getChanges ({ versionId, versionValue, branch } = {}) {
    return this.request(
      `/changes?${
        new URLSearchParams({
          ...(versionId ? { versionId } : {}),
          ...(versionValue ? { versionValue } : {}),
          ...(branch ? { branch } : {})
        }).toString()}`,
      {}
    )
  }
}

export default {
  /**
   * Creates a new SymstoryClient instance.
   * @param {string} appKey - The application key.
   * @param {object} options - The options for the client.
   * @returns {SymstoryClient} - The SymstoryClient instance.
   */
  create: (appKey, options) => new SymstoryClient(appKey, options),

  /**
   * Initializes the Symstory client.
   * @param {string} appKey - The application key.
   * @param {object} options - The options for the client.
   * @returns {SymstoryClient} - The initialized SymstoryClient instance.
   */
  init (appKey, options) {
    this.client = this.create(appKey, options)
    return this
  }
}
