import { BaseService } from './BaseService.js'
import { CollabClient } from '../utils/CollabClient.js'
import { RootStateManager } from '../state/RootStateManager.js'
import { rootBus } from '../state/rootEventBus.js'
import { validateParams } from '../utils/validation.js'
import { deepStringifyFunctions } from '@symbo.ls/utils'
import { preprocessChanges } from '../utils/changePreprocessor.js'
import { logger } from '../utils/logger.js'

// Helper: clone a value while converting all functions to strings. This is
// tailored for collab payloads (tuples / granularChanges) and is more robust
// for nested array shapes than the generic DOMQL helper.
const FUNCTION_META_KEYS = ['node', '__ref', '__element', 'parent', 'parse']

function stringifyFunctionsForTransport(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? value.toString() : value
  }

  if (seen.has(value)) {
    return seen.get(value)
  }

  const clone = Array.isArray(value) ? [] : {}
  seen.set(value, clone)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      clone[i] = stringifyFunctionsForTransport(value[i], seen)
    }
    return clone
  }

  const keys = Object.keys(value)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!FUNCTION_META_KEYS.includes(key)) {
      clone[key] = stringifyFunctionsForTransport(value[key], seen)
    }
  }

  return clone
}

export class CollabService extends BaseService {
  constructor(config) {
    super(config)
    this._client = null
    this._stateManager = null
    this._connected = false
    this._connecting = false
    this._connectPromise = null
    this._connectionMeta = null
    this._pendingConnectReject = null
    this._undoStack = []
    this._redoStack = []
    this._isUndoRedo = false
    // Store operations made while offline so they can be flushed once the
    // socket reconnects.
    this._pendingOps = []

    this._onSocketConnect = this._onSocketConnect.bind(this)
    this._onSocketDisconnect = this._onSocketDisconnect.bind(this)
    this._onSocketError = this._onSocketError.bind(this)
  }

  init({ context }) {
    super.init({ context })
    // console.log('CollabService init')
    // console.log(context)

    // Defer state manager creation until a valid root state is present.
    // The root state may not be set yet when the SDK is first initialised
    // (e.g. inside initializeSDK()). We therefore create the manager lazily
    // either when the SDK context is later updated or right before the first
    // connection attempt.
    if (context?.state) {
      try {
        this._stateManager = new RootStateManager(context.state)
      } catch (err) {
        this._setError(err)
        throw err
      }
    }

    this._setReady()
  }

  /**
   * Overridden to re-initialise the state manager once the root state becomes
   * available via a subsequent SDK `updateContext()` call.
   */
  updateContext(context = {}) {
    // Preserve base behaviour
    super.updateContext(context)

    // Lazily (re)create state manager if a state tree is available
    if (context.state) {
      this._stateManager = new RootStateManager(context.state)
    }
  }

  /**
   * Ensure that the state manager exists. This is called right before any
   * operation that requires access to the root state (e.g. `connect()`).
   * Throws an explicit error if the root state is still missing so that the
   * caller can react accordingly.
   */
  _ensureStateManager() {
    if (!this._stateManager) {
      if (!this._context?.state) {
        throw new Error('[CollabService] Cannot operate without root state')
      }
      this._stateManager = new RootStateManager(this._context.state)
    }

    // 🌐 Ensure we always have a usable `__element` stub so that calls like
    // `el.call('openNotification', …)` or `el.call('deepStringifyFunctions', …)` do not
    // crash in headless / Node.js environments (e.g. integration tests).
    const root = this._stateManager?.root

    if (root && !root.__element) {
      // Minimal no-op implementation of the DOMQL element API used here
      root.__element = {
        /**
         * Very small subset of the DOMQL `call` API that we rely on inside the
         * CollabService for browser notifications and data helpers.
         * In a Node.js test context we simply log or return fallbacks.
         */
        call: (method, ...args) => {
          switch (method) {
            case 'openNotification': {
              const [payload = {}] = args
              const { type = 'info', title = '', message = '' } = payload
              const logFn = type === 'error' ? logger.error : logger.log
              logFn(`[Notification] ${title}${message ? ` – ${message}` : ''}`)
              return
            }
            case 'deepStringifyFunctions': {
              // Pass-through to the shared utility from `smbls`
              return deepStringifyFunctions(...args)
            }
            default:
              return {}
          }
        }
      }
    }
  }

  /* ---------- Connection Management ---------- */
  async connect(options = {}) {
    if (this._connectPromise) {
      return this._connectPromise
    }

    this._connectPromise = (async () => {
      this._connecting = true
      this._connected = false

      // Make sure we have the state manager ready now that the context should
      // contain the root state (after updateSDKContext()).
      this._ensureStateManager()

      const mergedOptions = {
        ...this._context,
        ...options
      }

      let { authToken: jwt } = mergedOptions
      const { projectId, branch = 'main', pro } = mergedOptions

      if (!jwt && this._tokenManager) {
        try {
          jwt = await this._tokenManager.ensureValidToken()
        } catch (error) {
          logger.warn(
            '[CollabService] Failed to obtain auth token from token manager',
            error
          )
        }

        if (!jwt && typeof this._tokenManager.getAccessToken === 'function') {
          jwt = this._tokenManager.getAccessToken()
        }
      }

      if (!jwt) {
        throw new Error('[CollabService] Cannot connect without auth token')
      }

      this._context = {
        ...this._context,
        authToken: jwt,
        projectId,
        branch,
        pro
      }

      if (!projectId) {
        const state = this._stateManager?.root
        const el = state.__element
        el.call('openNotification', {
          type: 'error',
          title: 'projectId is required',
          message: 'projectId is required for CollabService connection'
        })
        throw new Error('projectId is required for CollabService connection')
      }

      // Disconnect existing connection if any
      if (this._client) {
        await this.disconnect()
      }

      this._client = new CollabClient({
        jwt,
        projectId,
        branch,
        live: Boolean(pro)
      })

      // Mark as connected once the socket establishes a connection. This prevents
      // the SDK from being stuck waiting for an initial snapshot that may never
      // arrive (e.g. for new/empty documents).
      const { socket } = this._client

      try {
        await new Promise((resolve, reject) => {
          if (!socket) {
            reject(new Error('[CollabService] Socket instance missing'))
            return
          }

          if (socket.connected) {
            resolve()
            return
          }

          /* eslint-disable no-use-before-define */
          const cleanup = () => {
            socket.off('connect', handleConnect)
            socket.off('connect_error', handleError)
            socket.off('error', handleError)
            socket.off('disconnect', handleDisconnect)
            if (this._pendingConnectReject === handleError) {
              this._pendingConnectReject = null
            }
          }

          const handleConnect = () => {
            cleanup()
            resolve()
          }

          const handleError = (error) => {
            cleanup()
            reject(
              error instanceof Error
                ? error
                : new Error(String(error || 'Unknown connection error'))
            )
          }

          const handleDisconnect = (reason) => {
            handleError(
              reason instanceof Error
                ? reason
                : new Error(
                    `[CollabService] Socket disconnected before connect: ${
                      reason || 'unknown'
                    }`
                  )
            )
          }

          this._pendingConnectReject = handleError

          socket.once('connect', handleConnect)
          socket.once('connect_error', handleError)
          socket.once('error', handleError)
          socket.once('disconnect', handleDisconnect)
          /* eslint-enable no-use-before-define */
        })
      } catch (error) {
        socket?.disconnect()
        this._client = null
        this._connectionMeta = null
        throw error
      }

      this._attachSocketLifecycleListeners()
      if (socket?.connected) {
        this._onSocketConnect()
      }

      // Set up event listeners
      socket?.on('ops', ({ changes }) => {
        logger.log(`ops event`)
        this._stateManager.applyChanges(changes, { fromSocket: true })
      })

      socket?.on('commit', ({ version }) => {
        if (version) {
          this._stateManager.setVersion(version)
        }

        // Inform UI about automatic commit
        rootBus.emit('checkpoint:done', { version, origin: 'auto' })
      })

      // 🔄  Presence / members / cursor updates
      socket?.on('clients', this._handleClientsEvent.bind(this))

      // 🗜️  Bundle events – emitted by the dependency bundler service
      socket?.on('bundle:done', this._handleBundleDoneEvent.bind(this))
      socket?.on('bundle:error', this._handleBundleErrorEvent.bind(this))

      // Flush any operations that were queued while we were offline.
      if (this._pendingOps.length) {
        logger.log(
          `[CollabService] Flushing ${this._pendingOps.length} offline operation batch(es)`
        )
        this._pendingOps.forEach(
          ({ changes, granularChanges, orders, options: opOptions }) => {
            const { message } = opOptions || {}
            const ts = Date.now()
            const payload = {
              changes,
              granularChanges,
              orders,
              ts
            }
            if (message) {
              payload.message = message
            }
            this.socket.emit('ops', payload)
          }
        )
        this._pendingOps.length = 0
      }

      await this._client.ready

      this._connectionMeta = {
        projectId,
        branch,
        live: Boolean(pro)
      }

      return this.getConnectionInfo()
    })()

    try {
      return await this._connectPromise
    } finally {
      this._connecting = false
      this._connectPromise = null
    }
  }

  disconnect() {
    if (this._client?.socket) {
      if (this._pendingConnectReject) {
        this._pendingConnectReject(
          new Error('[CollabService] Connection attempt aborted')
        )
        this._pendingConnectReject = null
      }
      this._detachSocketLifecycleListeners()
      if (typeof this._client.dispose === 'function') {
        this._client.dispose()
      } else {
        this._client.socket.disconnect()
      }
    }
    this._client = null
    this._connected = false
    this._connecting = false
    this._connectionMeta = null
    this._pendingConnectReject = null
    logger.log('[CollabService] Disconnected')
  }

  isConnected() {
    return Boolean(this._connected && this._client?.socket?.connected)
  }

  getConnectionInfo() {
    return {
      connected: this.isConnected(),
      connecting: this._connecting,
      projectId: this._connectionMeta?.projectId ?? null,
      branch: this._connectionMeta?.branch ?? null,
      live: this._connectionMeta?.live ?? null,
      pendingOps: this._pendingOps.length,
      undoStackSize: this.getUndoStackSize(),
      redoStackSize: this.getRedoStackSize()
    }
  }

  /* convenient shortcuts */
  get ydoc() {
    return this._client?.ydoc
  }
  get socket() {
    return this._client?.socket
  }

  toggleLive(f) {
    this._client?.toggleLive(f)
  }
  sendCursor(d) {
    this._client?.sendCursor(d)
  }
  sendPresence(d) {
    this._client?.sendPresence(d)
  }

  /* ---------- data helpers ---------- */
  updateData(tuples, options = {}) {
    // Always ensure we have a state manager so local changes are applied.
    this._ensureStateManager()

    const { isUndo = false, isRedo = false } = options

    // Track operations for undo/redo (but not when performing undo/redo)
    if (!isUndo && !isRedo && !this._isUndoRedo) {
      this._trackForUndo(tuples, options)
    }

    // Preprocess into granular changes and derive orders
    const root = this._stateManager?.root
    const { granularChanges: processedTuples, orders } = preprocessChanges(
      root,
      tuples,
      options
    )

    // Include any additional changes passed via opts
    if (options.append && options.append.length) {
      processedTuples.push(...options.append)
    }

    // Apply changes to local state tree immediately.
    this._stateManager.applyChanges(tuples, { ...options })

    // Use a dedicated helper that correctly handles nested array structures
    // such as granular tuples while also avoiding DOM / state metadata keys.
    const stringifiedGranularTuples =
      stringifyFunctionsForTransport(processedTuples)

    const stringifiedTuples = stringifyFunctionsForTransport(tuples)

    const { message } = options

    // If not connected yet, queue the operations for later synchronisation.
    if (!this.isConnected()) {
      logger.warn('[CollabService] Not connected, queuing real-time update')
      this._pendingOps.push({
        changes: stringifiedTuples,
        granularChanges: stringifiedGranularTuples,
        orders,
        options
      })
      return
    }

    // When connected, send the operations to the backend.
    if (this.socket?.connected) {
      const ts = Date.now()
      // console.log('[CollabService] Sending operations to the backend', {
      //   changes: stringifiedTuples,
      //   granularChanges: stringifiedGranularTuples,
      //   orders,
      //   ts,
      //   message
      // })
      const payload = {
        changes: stringifiedTuples,
        granularChanges: stringifiedGranularTuples,
        orders,
        ts
      }

      if (message) {
        payload.message = message
      }

      this.socket.emit('ops', payload)
    }

    return { success: true }
  }

  _trackForUndo(tuples, options) {
    // Get current state before changes for undo
    const undoOperations = tuples.map((tuple) => {
      const [action, path] = tuple
      const currentValue = this._getValueAtPath(path)

      if (action === 'delete') {
        // For delete operations, store the current value to restore
        return ['update', path, currentValue]
      }
      if (typeof currentValue !== 'undefined') {
        return ['update', path, currentValue]
      }
      return ['delete', path]
    })

    this._undoStack.push({
      operations: undoOperations,
      originalOperations: tuples,
      options,
      timestamp: Date.now()
    })

    // Clear redo stack when new operation is performed
    this._redoStack.length = 0

    // Limit undo stack size (configurable)
    const maxUndoSteps = this._options?.maxUndoSteps || 50
    if (this._undoStack.length > maxUndoSteps) {
      this._undoStack.shift()
    }
  }

  _getValueAtPath(path) {
    // Get value from root state at given path
    const state = this._stateManager?.root
    if (!state || !state.getByPath) {
      return null
    }

    try {
      return state.getByPath(path)
    } catch (error) {
      logger.warn('[CollabService] Could not get value at path:', path, error)
      return null
    }
  }

  undo() {
    if (!this._undoStack.length) {
      const state = this._stateManager?.root
      const el = state.__element
      el.call('openNotification', {
        type: 'error',
        title: 'Nothing to undo'
      })
      throw new Error('Nothing to undo')
    }

    if (!this.isConnected()) {
      logger.warn('[CollabService] Not connected, cannot undo')
      return
    }

    const undoItem = this._undoStack.pop()
    const { operations, originalOperations, options } = undoItem

    // Move to redo stack
    this._redoStack.push({
      operations: originalOperations,
      originalOperations: operations,
      options,
      timestamp: Date.now()
    })

    // Apply undo operations
    this._isUndoRedo = true
    try {
      this.updateData(operations, {
        ...options,
        isUndo: true,
        message: `Undo: ${options.message || 'operation'}`
      })
    } finally {
      this._isUndoRedo = false
    }

    return operations
  }

  redo() {
    if (!this._redoStack.length) {
      const state = this._stateManager?.root
      const el = state.__element
      el.call('openNotification', {
        type: 'error',
        title: 'Nothing to redo'
      })
      throw new Error('Nothing to redo')
    }

    if (!this.isConnected()) {
      logger.warn('[CollabService] Not connected, cannot redo')
      return
    }

    const redoItem = this._redoStack.pop()
    const { operations, originalOperations, options } = redoItem

    // Move back to undo stack
    this._undoStack.push({
      operations: originalOperations,
      originalOperations: operations,
      options,
      timestamp: Date.now()
    })

    // Apply redo operations
    this._isUndoRedo = true
    try {
      this.updateData(operations, {
        ...options,
        isRedo: true,
        message: `Redo: ${options.message || 'operation'}`
      })
    } finally {
      this._isUndoRedo = false
    }

    return operations
  }

  /* ---------- Undo/Redo State ---------- */
  canUndo() {
    return this._undoStack.length > 0
  }

  canRedo() {
    return this._redoStack.length > 0
  }

  getUndoStackSize() {
    return this._undoStack.length
  }

  getRedoStackSize() {
    return this._redoStack.length
  }

  clearUndoHistory() {
    this._undoStack.length = 0
    this._redoStack.length = 0
  }

  addItem(type, data, opts = {}) {
    try {
      validateParams.type(type)
      validateParams.data(data, type)

      const { value, ...schema } = data

      // Base tuple for the actual value update
      const tuples = [
        ['update', [type, data.key], value],
        ['update', ['schema', type, data.key], schema || {}]
      ]

      // Prevent components:changed event emission when updateData is invoked via addItem
      const updatedOpts = { ...opts, skipComponentsChangedEvent: true }

      return this.updateData(tuples, updatedOpts)
    } catch (error) {
      throw new Error(`Failed to add item: ${error.message}`, { cause: error })
    }
  }

  addMultipleItems(items, opts = {}) {
    const tuples = []

    try {
      items.forEach(([type, data]) => {
        validateParams.type(type)
        validateParams.data(data, type)

        const { value, ...schema } = data

        tuples.push(
          ['update', [type, data.key], value],
          ['update', ['schema', type, data.key], schema]
        )
      })

      this.updateData([...tuples, ...(opts.append || [])], {
        message: `Created ${tuples.length} items`,
        ...opts
      })
      return tuples
    } catch (error) {
      const state = this._stateManager?.root
      const el = state.__element
      el.call('openNotification', {
        type: 'error',
        title: 'Failed to add item',
        message: error.message
      })
      throw new Error(`Failed to add item: ${error.message}`, { cause: error })
    }
  }

  updateItem(type, data, opts = {}) {
    try {
      validateParams.type(type)
      validateParams.data(data, type)

      const { value, ...schema } = data
      const tuples = [
        ['update', [type, data.key], value],
        ['update', ['schema', type, data.key], schema]
      ]
      return this.updateData(tuples, opts)
    } catch (error) {
      const state = this._stateManager?.root
      const el = state.__element
      el.call('openNotification', {
        type: 'error',
        title: 'Failed to update item',
        message: error.message
      })
      throw new Error(`Failed to update item: ${error.message}`, {
        cause: error
      })
    }
  }

  deleteItem(type, key, opts = {}) {
    try {
      validateParams.type(type)
      validateParams.key(key, type)

      const tuples = [
        ['delete', [type, key]],
        ['delete', ['schema', type, key]],
        ...(opts.append || [])
      ]
      return this.updateData(tuples, {
        message: `Deleted ${key} from ${type}`,
        ...opts
      })
    } catch (error) {
      const state = this._stateManager?.root
      const el = state.__element
      el.call('openNotification', {
        type: 'error',
        title: 'Failed to delete item',
        message: error.message
      })
      throw new Error(`Failed to delete item: ${error.message}`, {
        cause: error
      })
    }
  }

  /* ---------- socket event helpers ---------- */
  /**
   * Handle "clients" or "presence" events coming from the collab socket.
   * The backend sends the full `clients` object which we directly patch to
   * the root state, mimicking the legacy SocketService behaviour so that
   * existing UI components keep working unmodified.
   */
  _handleClientsEvent(data = {}) {
    const root = this._stateManager?.root
    if (root && typeof root.replace === 'function') {
      root.clients = data
    }
    rootBus.emit('clients:updated', data)
  }

  /* ---------- Dependency bundling events ---------- */
  _handleBundleDoneEvent({
    project,
    ticket,
    dependencies = {},
    schema = {}
  } = {}) {
    logger.log('[CollabService] Bundle done', { project, ticket })

    // Update local state with latest dependency information
    try {
      this._ensureStateManager()

      const { dependencies: schemaDependencies = {} } = schema || {}

      const tuples = [
        ['update', ['dependencies'], dependencies],
        ['update', ['schema', 'dependencies'], schemaDependencies]
      ]

      this._stateManager.applyChanges(tuples, {
        fromSocket: true,
        preventFetchDeps: true,
        preventUpdate: ['Iframe']
      })
    } catch (err) {
      logger.error('[CollabService] Failed to update deps after bundle', err)
    }

    // Notify UI via rootBus and toast/notification helper if available
    const root = this._stateManager?.root
    const el = root?.__element

    if (el?.call) {
      el.call('openNotification', {
        type: 'success',
        title: 'Dependencies ready',
        message: `Project ${project} dependencies have been bundled successfully.`
      })
    }

    rootBus.emit('bundle:done', { project, ticket })
  }

  _handleBundleErrorEvent({ project, ticket, error } = {}) {
    logger.error('[CollabService] Bundle error', { project, ticket, error })

    const root = this._stateManager?.root
    const el = root?.__element

    if (el?.call) {
      el.call('openNotification', {
        type: 'error',
        title: 'Dependency bundle failed',
        message:
          error ||
          `An error occurred while bundling dependencies for project ${project}.`
      })
    }

    rootBus.emit('bundle:error', { project, ticket, error })
  }

  /* ---------- Manual checkpoint ---------- */
  _attachSocketLifecycleListeners() {
    const socket = this._client?.socket
    if (!socket) {
      return
    }

    socket.on('connect', this._onSocketConnect)
    socket.on('disconnect', this._onSocketDisconnect)
    socket.on('connect_error', this._onSocketError)
  }

  _detachSocketLifecycleListeners() {
    const socket = this._client?.socket
    if (!socket) {
      return
    }

    socket.off('connect', this._onSocketConnect)
    socket.off('disconnect', this._onSocketDisconnect)
    socket.off('connect_error', this._onSocketError)
  }

  _onSocketConnect() {
    this._connected = true
  }

  _onSocketDisconnect(reason) {
    this._connected = false

    if (reason && reason !== 'io client disconnect') {
      logger.warn('[CollabService] Socket disconnected', reason)
    }
  }

  _onSocketError(error) {
    logger.warn('[CollabService] Socket connection error', error)
  }

  /**
   * Manually request a checkpoint / commit of buffered operations on the server.
   * Resolves with the new version number once the backend confirms via the
   * regular "commit" event.
   */
  checkpoint() {
    if (!this.isConnected()) {
      logger.warn('[CollabService] Not connected, cannot request checkpoint')
      return Promise.reject(new Error('Not connected'))
    }

    return new Promise((resolve) => {
      const handler = ({ version }) => {
        // Ensure we clean up the listener after the first commit event.
        this.socket?.off('commit', handler)
        rootBus.emit('checkpoint:done', { version, origin: 'manual' })
        resolve(version)
      }

      // Listen for the next commit that the server will emit after checkpoint.
      this.socket?.once('commit', handler)

      // Trigger server-side checkpoint.
      this.socket?.emit('checkpoint')
    })
  }
}
