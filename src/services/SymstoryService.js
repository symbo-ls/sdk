/* eslint-disable default-param-last */
/* eslint-disable no-param-reassign */
import { BaseService } from './BaseService.js'
import symstory from '../utils/symstoryClient.js'

import * as utils from '@domql/utils'
import { validateParams } from '../utils/validation.js'
const { deepStringify, isFunction, isObjectLike } = utils.default || utils

export class SymstoryService extends BaseService {
  constructor (config) {
    super(config)
    this._client = null
    this._cache = new Map()
    this._state = {}
    this._socketService = this._context.services.socket
    this._undoStack = []
    this._redoStack = []
  }

  async init () {
    try {
      const { appKey, authToken, state, socketUrl } = this._context || {}

      if (!appKey) {
        this._setReady(false)
        return
      }

      // Initialize client with auth headers
      symstory.init(appKey, {
        headers: {
          ...(authToken && { Authorization: `Bearer ${authToken}` })
        }
      })

      this._client = symstory.client
      this._state = this._isObject(state) ? state : {}

      // Initialize socket service if URL provided
      if (socketUrl) {
        await this._socketService.init()
      }

      this._info = {
        config: {
          appKey: `${appKey.substr(0, 4)}...${appKey.substr(-4)}`,
          hasToken: Boolean(authToken),
          hasState: Boolean(state),
          hasSocket: this._socketService._socket !== null,
          socketStatus:
            this._socketService._info?.config?.status || 'disconnected',
          timestamp: new Date().toISOString()
        }
      }

      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  // publish a new version

  async publish ({ version, type = 'minor' } = {}) {
    if (version) {
      await this._client.publishVersion(version, { type })
    } else {
      await this.updateData([], { type })
    }
  }

  // get changes between versions

  async getChanges ({ versionId, versionValue, branch } = {}) {
    return this._client.getChanges({ versionId, versionValue, branch })
  }

  safeStringify (obj) {
    const seen = new WeakSet()
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return
        }
        seen.add(value)
      }
      return value
    })
  }

  // Update project data

  async updateData (changes, options = {}, callback) {
    this._requireReady()

    const {
      type = 'patch',
      message = '',
      branch = this._context.symstory?.branch || 'main',
      fromSocket = false,
      quietUpdate = false,
      isUndo,
      isRedo
    } = options

    try {
      const { state } = this._context

      // if not on the latest version don't proceed
      if ('isOld' in state && state.isOld) {
        return
      }

      const updates = changes.map(change => ({
        change,
        prev: state?.getByPath(change[1])
      }))

      // Update local state if available
      if (state && 'setPathCollection' in state && !quietUpdate) {
        await state.setPathCollection(changes, {
          preventUpdate: true,
          ...options
        })
      }

      const filteredUpdates = updates.filter(({ change, prev }) => {
        if (change && change.err) {
          delete change.err
        }
        if (prev && prev.err) {
          delete prev.err
        }
        return (
          // eslint-disable-next-line no-undefined
          change[3] !== undefined ||
          this.safeStringify(change[2]) !== this.safeStringify(prev)
        )
      })

      if (!fromSocket && !isUndo) {
        if (!isRedo) {
          this._redoStack.length = 0
        }
        this._undoStack.push({
          updates: filteredUpdates,
          options,
          time: new Date()
        })
      }

      // Don't proceed with backend/socket updates if change came from socket
      if (fromSocket) {
        return
      }

      // Prepare stringified data for backend and socket
      const stringifiedData = changes.map(([action, path, change]) => {
        if (isFunction(change)) {
          return [action, path, change?.toString() ?? change]
        }
        if (change && change.err) {
          delete change.err
        }
        return [
          action,
          path,
          isObjectLike(change)
            ? deepStringify(change, Array.isArray(change) ? [] : {})
            : change
        ]
      })

      const res = await this._context.services.core.applyProjectChanges(
        state.projectId,
        stringifiedData,
        {
          type,
          message,
          branch
        }
      )

      // Send to socket if connected
      if (this._socketService._socket) {
        this._socketService.send('change', {
          type: 'update',
          changes: stringifiedData,
          version: res?.value
        })
      }

      if (res?.value) {
        // Update context with new version
        this._context.symstory = {
          ...this._context.symstory,
          version: res.value
        }
        if (state && 'quietUpdate' in state) {
          const { isVersionsOpen } = state
          if (isVersionsOpen) {
            state.quietUpdate({ version: res.value })
          } else {
            state.version = res.value
          }
        }
        // Clear cache after successful update
        this._cache.clear()
      }

      if ('__element' in this._state && isFunction(callback)) {
        await callback.call(this._state.__element, changes, res)
      }

      return res
    } catch (error) {
      if (isFunction(callback)) {
        callback(error)
      }
      throw new Error(`Failed to update data: ${error.message}`)
    }
  }

  async undo () {
    if (!this._undoStack.length) {
      throw new Error('Nothing to undo')
    }
    const { updates, options } = this._undoStack.pop()
    const changes = updates.map(({ change, prev }) => [
      change[0],
      change[1],
      prev
    ])
    this._redoStack.push({
      updates: updates.map(({ change, prev }) => ({
        change: [change[0], change[1], prev],
        prev: change[2]
      })),
      options
    })
    await this.updateData(
      changes,
      { ...options, isUndo: true, message: `Undo: ${options.message || ''}` },
      () => changes
    )
    return changes
  }

  async redo () {
    if (!this._redoStack.length) {
      throw new Error('Nothing to redo')
    }
    const { updates, options } = this._redoStack.pop()
    const changes = updates.map(({ change, prev }) => [
      change[0],
      change[1],
      prev
    ])
    await this.updateData(
      changes,
      { ...options, isRedo: true, message: `Redo: ${options.message || ''}` },
      () => changes
    )
    return changes
  }

  // Delete project data
  async deleteData (path, options = {}, callback) {
    this._requireReady()

    try {
      const changes = [['delete', path]]
      return await this.updateData(changes, options, callback)
    } catch (error) {
      throw new Error(`Failed to delete data: ${error.message}`)
    }
  }

  // Get project data

  async getData (query, options = {}) {
    this._requireReady()

    try {
      const {
        branch = this._context.symstory?.branch || 'main',
        version = this._context.symstory?.version,
        bypassCache = false,
        timeout = 30000
      } = options

      // Generate cache key if caching is enabled
      const cacheKey =
        !bypassCache && this._generateCacheKey(query, branch, version)

      // Check cache first if enabled
      if (!bypassCache && cacheKey && this._cache.has(cacheKey)) {
        return this._cache.get(cacheKey)
      }

      // Validate query if provided
      if (query && typeof query === 'object') {
        // Ensure query is properly structured
        if (!query.$find && !query.$filter) {
          throw new Error(
            'Invalid query structure. Must include $find or $filter.'
          )
        }
      }

      // Make the request with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const result = await this._client.get(query, branch, version)

        // Cache the result if caching is enabled
        if (!bypassCache && cacheKey) {
          this._cache?.set(cacheKey, result)
        }

        return result
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${options.timeout}ms`)
      }
      throw new Error(`Failed to get data: ${error.message}`)
    }
  }

  // Helper method to check if a variable is a valid object
  _isObject (variable) {
    return (
      variable !== null &&
      typeof variable === 'object' &&
      !Array.isArray(variable)
    )
  }

  // Helper method to generate cache key
  _generateCacheKey (query, branch, version) {
    if (!query) {
      return null
    }
    return JSON.stringify({
      query,
      branch,
      version
    })
  }

  // Helper method to clear cache
  clearCache () {
    this._cache.clear()
  }

  // Helper method to remove specific cache entry
  removeCacheEntry (query, branch, version) {
    const cacheKey = this._generateCacheKey(query, branch, version)
    if (cacheKey) {
      this._cache.delete(cacheKey)
    }
  }

  // Branch Management
  async getBranches () {
    this._requireReady()

    try {
      return await this._client.getBranches()
    } catch (error) {
      throw new Error(`Failed to get branches: ${error.message}`)
    }
  }

  async createBranch (branch, options = {}) {
    this._requireReady()
    if (!branch) {
      throw new Error('Branch name is required.')
    }
    try {
      return await this._client.createBranch(branch, options)
    } catch (error) {
      throw new Error(`Failed to create branch: ${error.message}`)
    }
  }

  async editBranch (branch, options = {}) {
    this._requireReady()
    if (!branch) {
      throw new Error('Branch name is required.')
    }
    try {
      return await this._client.editBranch(branch, options)
    } catch (error) {
      throw new Error(`Failed to edit branch: ${error.message}`)
    }
  }

  async deleteBranch (branch) {
    this._requireReady()
    if (!branch) {
      throw new Error('Branch name is required.')
    }
    try {
      return await this._client.deleteBranch(branch)
    } catch (error) {
      throw new Error(`Failed to delete branch: ${error.message}`)
    }
  }

  async mergeBranch (branch, options = {}) {
    this._requireReady()
    if (!branch) {
      throw new Error('Branch name is required.')
    }
    try {
      return await this._client.mergeBranch(branch, options)
    } catch (error) {
      throw new Error(`Failed to merge branch: ${error.message}`)
    }
  }

  async restoreVersion (version, options = {}) {
    this._requireReady()

    const { branch = this._context.symstory?.branch } = options

    version ||= this._context.symstory?.version

    try {
      return await this._client.restoreVersion(version, { ...options, branch })
    } catch (error) {
      throw new Error(`Failed to restore version: ${error.message}`)
    }
  }

  // Cleanup
  destroy () {
    this._client = null
    this._setReady(false)
  }

  // Data management methods
  async getItem (query, options = {}) {
    this._requireReady()

    try {
      return await this.getData(query, options)
    } catch (error) {
      throw new Error(`Failed to get item: ${error.message}`)
    }
  }

  async addItem (type, data, options = {}, callback) {
    this._requireReady()

    try {
      validateParams.type(type)
      validateParams.data(data, type)

      const { value, ...schema } = data

      return await this.updateData(
        [
          ['update', [type, data.key], value],
          ['update', ['schema', type, data.key], schema],
          ...(options.additionalChanges || [])
        ],
        {
          message: `Created ${data.key} in ${type}`,
          ...options
        },
        isFunction(options) ? options : callback
      )
    } catch (error) {
      throw new Error(`Failed to add item: ${error.message}`)
    }
  }

  async addMultipleItems (items, options = {}, callback) {
    this._requireReady()

    const updateData = []

    items.forEach(item => {
      const [type, data] = item
      const { value, ...schema } = data

      validateParams.type(type)
      validateParams.data(data, type)

      updateData.push(
        ['update', [type, data.key], value],
        ['update', ['schema', type, data.key], schema]
      )
    })

    try {
      return await this.updateData(
        [...updateData, ...(options.additionalChanges || [])],
        {
          message: `Created ${updateData.length} items`,
          ...options
        },
        isFunction(options) ? options : callback
      )
    } catch (error) {
      throw new Error(`Failed to add item: ${error.message}`)
    }
  }

  async updateItem (type, data, options = {}, callback) {
    this._requireReady()

    try {
      validateParams.type(type)
      validateParams.data(data, type)

      const { value, ...schema } = data
      return await this.updateData(
        [
          ['update', [type, data.key], value],
          ['update', ['schema', type, data.key], schema]
        ],
        {
          message: `Updated ${data.key} in ${type}`,
          ...options
        },
        isFunction(options) ? options : callback
      )
    } catch (error) {
      throw new Error(`Failed to update item: ${error.message}`)
    }
  }

  async set (path, value, options = {}, callback) {
    this._requireReady()

    if (!utils.isUndefined(path) || utils.isUndefined(value)) {
      return new Error(`Path ${path} or ${value} value is not defined`)
    }

    try {
      return await this.updateData(
        [['update', path, value]],
        {
          message: `Updated ${utils.isArray(path) ? path.join('.') : path}`,
          ...options
        },
        isFunction(options) ? options : callback
      )
    } catch (error) {
      throw new Error(`Failed to update item: ${error.message}`)
    }
  }

  async deleteItem (type, key, options = {}, callback) {
    this._requireReady()

    try {
      validateParams.type(type)
      validateParams.key(key, type)

      return await this.updateData(
        [
          ['delete', [type, key]],
          ['delete', ['schema', type, key]],
          ...(options.additionalChanges || [])
        ],
        {
          message: `Deleted ${key} from ${type}`,
          ...options
        },
        isFunction(options) ? options : callback
      )
    } catch (error) {
      throw new Error(`Failed to delete item: ${error.message}`)
    }
  }

  // Helper methods

  _createQuery (filters = []) {
    return {
      $find: {
        $traverse: 'children',
        $filter: filters.filter(Boolean).map(([field, operator, value]) => ({
          $field: field,
          $operator: operator,
          $value: value
        }))
      }
    }
  }

  _checkRequiredContext () {
    return Boolean(
      this._context?.appKey && this._context?.authToken && this._client
    )
  }

  isReady () {
    if (this._checkRequiredContext()) {
      this._setReady(true)
    }

    return this._ready
  }

  async switchBranch (branch) {
    this._requireReady()

    try {
      this.updateContext({
        symstory: {
          ...this._context.symstory,
          branch,
          version: null
        }
      })
      return await this.getData()
    } catch (error) {
      throw new Error(`Failed to switch branch: ${error.message}`)
    }
  }

  async switchVersion (version) {
    this._requireReady()

    try {
      this.updateContext({
        symstory: {
          ...this._context.symstory,
          version
        }
      })
      return await this.getData()
    } catch (error) {
      throw new Error(`Failed to switch version: ${error.message}`)
    }
  }
}
