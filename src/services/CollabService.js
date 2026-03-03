import { BaseService } from './BaseService.js'
import { CollabClient } from '../utils/CollabClient.js'
import { RootStateManager } from '../state/RootStateManager.js'
import { rootBus } from '../state/rootEventBus.js'

// (helper conversions reserved for future features)

export class CollabService extends BaseService {
  constructor (config) {
    super(config)
    this._client = null
    this._stateManager = null
    this._connected = false
    this._undoStack = []
    this._redoStack = []
    this._isUndoRedo = false
    // Store operations made while offline so they can be flushed once the
    // socket reconnects.
    this._pendingOps = []
  }

  init ({ context }) {
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
  updateContext (context = {}) {
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
  _ensureStateManager () {
    if (!this._stateManager) {
      if (!this._context?.state) {
        throw new Error('[CollabService] Cannot operate without root state')
      }
      this._stateManager = new RootStateManager(this._context.state)
    }
  }

  /* ---------- Connection Management ---------- */
  async connect (options = {}) {
    // Make sure we have the state manager ready now that the context should
    // contain the root state (after updateSDKContext()).
    this._ensureStateManager()

    const {
      authToken: jwt,
      projectId,
      branch = 'main',
      pro
    } = {
      ...this._context,
      ...options
    }
    console.log(jwt, projectId, branch, pro)

    if (!projectId) {
      throw new Error('projectId is required for CollabService connection')
    }

    // Disconnect existing connection if any
    if (this._client) {
      await this.disconnect()
    }

    try {
      this._client = new CollabClient({
        jwt,
        projectId,
        branch,
        live: Boolean(pro)
      })

      // Mark as connected once the socket establishes a connection. This prevents
      // the SDK from being stuck waiting for an initial snapshot that may never
      // arrive (e.g. for new/empty documents).
      await new Promise(resolve => {
        if (this._client.socket?.connected) {
          resolve()
        } else {
          this._client.socket?.once('connect', resolve)
        }
      })

      console.log('[CollabService] socket connected')

      // Set up event listeners
      this._client.socket?.on('ops', ({ changes }) => {
        console.log(`ops event`)
        console.log(changes)
        this._stateManager.applyChanges(changes, { fromSocket: true })
      })

      this._client.socket?.on('commit', ({ version }) => {
        this._stateManager.setVersion(version)
        // Inform UI about automatic commit
        rootBus.emit('checkpoint:done', { version, origin: 'auto' })
      })

      // 🔄  Presence / members / cursor updates
      this._client.socket?.on('clients', this._handleClientsEvent.bind(this))
      this._client.socket?.on('presence', this._handleClientsEvent.bind(this))
      this._client.socket?.on('cursor', this._handleCursorEvent.bind(this))

      // Flush any operations that were queued while we were offline.
      if (this._pendingOps.length) {
        console.log(
          `[CollabService] Flushing ${this._pendingOps.length} offline operation batch(es)`
        )
        this._pendingOps.forEach(({ tuples }) => {
          this.socket.emit('ops', { changes: tuples, ts: Date.now() })
        })
        this._pendingOps.length = 0
      }

      this._connected = true
      console.log('[CollabService] Connected to project:', projectId)
    } catch (err) {
      console.error('[CollabService] Connection failed:', err)
      throw err
    }
  }

  disconnect () {
    if (this._client?.socket) {
      this._client.socket.disconnect()
    }
    this._client = null
    this._connected = false
    console.log('[CollabService] Disconnected')
  }

  isConnected () {
    return this._connected && this._client?.socket?.connected
  }

  /* convenient shortcuts */
  get ydoc () {
    return this._client?.ydoc
  }
  get socket () {
    return this._client?.socket
  }

  toggleLive (f) {
    this._client?.toggleLive(f)
  }
  sendCursor (d) {
    this._client?.sendCursor(d)
  }
  sendPresence (d) {
    this._client?.sendPresence(d)
  }

  /* ---------- data helpers ---------- */
  updateData (tuples, options = {}) {
    // Always ensure we have a state manager so local changes are applied.
    this._ensureStateManager()

    const { isUndo = false, isRedo = false } = options

    // Track operations for undo/redo (but not when performing undo/redo)
    if (!isUndo && !isRedo && !this._isUndoRedo) {
      this._trackForUndo(tuples, options)
    }

    // Apply changes to local state tree immediately.
    this._stateManager.applyChanges(tuples, { ...options })

    // If not connected yet, queue the operations for later synchronisation.
    if (!this.isConnected()) {
      console.warn('[CollabService] Not connected, queuing real-time update')
      this._pendingOps.push({ tuples, options })
      return
    }

    // When connected, send the operations to the backend.
    if (this.socket?.connected) {
      this.socket.emit('ops', { changes: tuples, ts: Date.now() })
    }

    return { success: true }
  }

  _trackForUndo (tuples, options) {
    // Get current state before changes for undo
    const undoOperations = tuples.map(tuple => {
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

  _getValueAtPath (path) {
    // Get value from root state at given path
    const state = this._stateManager?.root
    if (!state || !state.getByPath) {
      return null
    }

    try {
      return state.getByPath(path)
    } catch (error) {
      console.warn('[CollabService] Could not get value at path:', path, error)
      return null
    }
  }

  undo () {
    if (!this._undoStack.length) {
      throw new Error('Nothing to undo')
    }

    if (!this.isConnected()) {
      console.warn('[CollabService] Not connected, cannot undo')
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

  redo () {
    if (!this._redoStack.length) {
      throw new Error('Nothing to redo')
    }

    if (!this.isConnected()) {
      console.warn('[CollabService] Not connected, cannot redo')
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
  canUndo () {
    return this._undoStack.length > 0
  }

  canRedo () {
    return this._redoStack.length > 0
  }

  getUndoStackSize () {
    return this._undoStack.length
  }

  getRedoStackSize () {
    return this._redoStack.length
  }

  clearUndoHistory () {
    this._undoStack.length = 0
    this._redoStack.length = 0
  }

  addItem (type, data, opts = {}) {
    const { value, ...schema } = data
    const tuples = [
      ['update', [type, data.key], value],
      ['update', ['schema', type, data.key], schema],
      ...(opts.additionalChanges || [])
    ]
    return this.updateData(tuples, opts)
  }

  addMultipleItems (items, opts = {}) {
    const tuples = []
    items.forEach(([type, data]) => {
      const { value, ...schema } = data
      tuples.push(
        ['update', [type, data.key], value],
        ['update', ['schema', type, data.key], schema]
      )
    })

    this.updateData([...tuples, ...(opts.additionalChanges || [])], {
      message: `Created ${tuples.length} items`,
      ...opts
    })

    return tuples
  }

  updateItem (type, data, opts = {}) {
    const { value, ...schema } = data
    const tuples = [
      ['update', [type, data.key], value],
      ['update', ['schema', type, data.key], schema]
    ]
    return this.updateData(tuples, opts)
  }

  deleteItem (type, key, opts = {}) {
    const tuples = [
      ['delete', [type, key]],
      ['delete', ['schema', type, key]],
      ...(opts.additionalChanges || [])
    ]
    return this.updateData(tuples, {
      message: `Deleted ${key} from ${type}`,
      ...opts
    })
  }

  /* ---------- socket event helpers ---------- */
  /**
   * Handle "clients" or "presence" events coming from the collab socket.
   * The backend sends the full `clients` object which we directly patch to
   * the root state, mimicking the legacy SocketService behaviour so that
   * existing UI components keep working unmodified.
   */
  _handleClientsEvent (data = {}) {
    const root = this._stateManager?.root
    if (root && typeof root.replace === 'function') {
      root.replace(
        { clients: data },
        {
          fromSocket: true,
          preventUpdate: true
        }
      )
    }
  }

  /**
   * Handle granular cursor updates coming from the socket.
   * Expected payload: { userId, positions?, chosenPos?, ... }
   * Only the provided fields are patched into the state tree.
   */
  _handleCursorEvent (payload = {}) {
    const { userId, positions, chosenPos, ...rest } = payload || {}
    if (!userId) {
      return
    }

    const tuples = []

    if (positions) {
      tuples.push([
        'update',
        ['canvas', 'clients', userId, 'positions'],
        positions
      ])
    }

    if (chosenPos) {
      tuples.push([
        'update',
        ['canvas', 'clients', userId, 'chosenPos'],
        chosenPos
      ])
    }

    // merge any additional cursor–related fields directly under the user node
    if (Object.keys(rest).length) {
      tuples.push(['update', ['canvas', 'clients', userId], rest])
    }

    if (tuples.length) {
      this._stateManager.applyChanges(tuples, { fromSocket: true })
    }
  }

  /* ---------- Manual checkpoint ---------- */
  /**
   * Manually request a checkpoint / commit of buffered operations on the server.
   * Resolves with the new version number once the backend confirms via the
   * regular "commit" event.
   */
  checkpoint () {
    if (!this.isConnected()) {
      console.warn('[CollabService] Not connected, cannot request checkpoint')
      return Promise.reject(new Error('Not connected'))
    }

    return new Promise(resolve => {
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
