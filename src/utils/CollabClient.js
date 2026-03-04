import { io } from 'socket.io-client'
import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import environment from '../config/environment.js'
// import gzip from 'gzip-js' // reserved for future compression features

// diff / patch helpers
import { diffJson, applyOpsToJson } from './jsonDiff.js'

/* eslint-disable no-use-before-define, no-new, no-promise-executor-return */

// Dexie and IndexeddbPersistence will be conditionally imported in browser environments

export class CollabClient {
  /* public fields */
  socket = null
  ydoc = null
  branch = 'main'
  live = false
  projectId = null
  jwt = null

  /* private state */
  _buffer = []
  _flushTimer = null
  _clientId = nanoid()
  _outboxStore = createMemoryOutbox() // Dexie table fallback
  _readyResolve
  ready = new Promise(res => (this._readyResolve = res))

  constructor ({ jwt, projectId, branch = 'main', live = false }) {
    Object.assign(this, { jwt, projectId, branch, live })

    /* 1️⃣  create Yjs doc + offline persistence */
    this.ydoc = new Y.Doc()

    // Only use IndexeddbPersistence in browser environments
    const hasIndexedDB = typeof globalThis.indexedDB !== 'undefined'

    if (typeof window === 'undefined' || !hasIndexedDB) {
      // In Node.js (or when indexedDB is not available), skip persistence
      console.log('[CollabClient] IndexedDB not available – skipping offline persistence')
    } else {
      // Dynamically import IndexeddbPersistence only when indexedDB exists
      import('y-indexeddb')
        .then(({ IndexeddbPersistence }) => {
          new IndexeddbPersistence(`${projectId}:${branch}`, this.ydoc)
        })
        .catch(err => {
          console.warn('[CollabClient] Failed to load IndexeddbPersistence:', err)
        })
    }

    /* 2️⃣  init Dexie for outbox (browser only) */
    if (typeof window !== 'undefined' && hasIndexedDB) {
      // In browser environments, use Dexie
      createDexieOutbox(`${projectId}:${branch}`)
        .then(outboxStore => {
          this._outboxStore = outboxStore
        })
        .catch(err => {
          console.warn('[CollabClient] Failed to load Dexie:', err)
        })
    }

    /* 3️⃣  WebSocket transport */
    this.socket = io(environment.socketUrl, {
      path: '/collab-socket',
      transports: ['websocket'],
      auth: { token: jwt, projectId, branch, live },
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 4000
    })

    /* socket events */
    this.socket
      .on('snapshot', this._onSnapshot)
      .on('ops', this._onOps)
      .on('commit', this._onCommit)
      .on('liveMode', this._onLiveMode)
      .on('connect', this._onConnect)
      .on('error', this._onError)

    /* Track last known JSON representation so we can compute granular diffs. */
    this._prevJson = this.ydoc.getMap('root').toJSON()

    /* 4️⃣  hook Yjs change listener */
    this.ydoc.on('afterTransaction', tr => {
      // Ignore changes that originated from remote patches.
      if (tr.origin === 'remote') {return}

      const currentJson = this.ydoc.getMap('root').toJSON()

      // Compute minimal diff between previous and current state.
      const ops = diffJson(this._prevJson, currentJson)

      // Cache new snapshot for next diff calculation.
      this._prevJson = currentJson

      if (!ops.length) {return}
      this._queueOps(ops)
    })
  }

  /* ---------- public helpers ---------- */
  toggleLive (flag) { this.socket.emit('toggleLive', Boolean(flag)) }
  sendCursor (data) { this.socket.emit('cursor', data) }
  sendPresence (d) { this.socket.emit('presence', d) }

  /* ---------- private handlers ---------- */
  _onSnapshot = ({ data /* Uint8Array */ }) => {
    if (Array.isArray(data) ? data.length : (data && data.byteLength)) {
      // First paint; trust server compressed payload (≤256 kB)
      Y.applyUpdate(this.ydoc, Uint8Array.from(data))
    } else {
      console.warn('[collab] Received empty snapshot – skipping applyUpdate')
    }

    // Store current state as baseline for future diffs.
    this._prevJson = this.ydoc.getMap('root').toJSON()
    if (typeof this._readyResolve === 'function') {
      this._readyResolve()
      this._readyResolve = null
    }
  }

  _onOps = ({ changes }) => {
    // Apply remote ops
    applyOpsToJson(changes, this.ydoc)

    // Refresh baseline snapshot so we don't generate redundant diffs for the
    // just-applied remote changes.
    this._prevJson = this.ydoc.getMap('root').toJSON()
  }

  _onCommit = async ({ version }) => {
    await this._outboxStore.clear()
    console.info('[collab] committed', version)
  }

  _onConnect = async () => {
    // Mark client as ready if we haven't received a snapshot yet
    if (typeof this._readyResolve === 'function') {
      this._readyResolve()
      // Prevent multiple resolutions
      this._readyResolve = null
    }

    // flush locally stored ops
    const queued = await this._outboxStore.toArray()
    if (queued.length) {
      this.socket.emit('ops', {
        changes: queued.flatMap(e => e.ops),
        ts: Date.now(),
        clientId: this._clientId
      })
      await this._outboxStore.clear()
    }
  }

  /* ---------- buffering & debounce ---------- */
  _queueOps (ops) {
    this._buffer.push(...ops)
    this._outboxStore.put({ id: nanoid(), ops })

    if (this.live && this.socket.connected) {
      this._flushNow()
    } else {
      clearTimeout(this._flushTimer)
      this._flushTimer = setTimeout(() => this._flushNow(), 40)
    }
  }

  _flushNow () {
    if (!this._buffer.length || !this.socket.connected) {return}
    this.socket.emit('ops', {
      changes: this._buffer,
      ts: Date.now(),
      clientId: this._clientId
    })
    this._buffer.length = 0
  }

  dispose () {
    clearTimeout(this._flushTimer)
    this._flushTimer = null
    this._buffer.length = 0

    if (this._outboxStore?.clear) {
      try {
        const result = this._outboxStore.clear()
        if (result && typeof result.catch === 'function') {
          result.catch(() => {})
        }
      } catch (error) {
        console.warn('[CollabClient] Failed to clear outbox store during dispose:', error)
      }
    }

    if (this.socket) {
      this.socket.off('snapshot', this._onSnapshot)
      this.socket.off('ops', this._onOps)
      this.socket.off('commit', this._onCommit)
      this.socket.off('liveMode', this._onLiveMode)
      this.socket.off('connect', this._onConnect)
      this.socket.off('error', this._onError)
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    if (this.ydoc) {
      this.ydoc.destroy()
      this.ydoc = null
    }

    if (typeof this._readyResolve === 'function') {
      this._readyResolve()
      this._readyResolve = null
    }
  }

  _onLiveMode = (flag) => {
    this.live = flag
  }

  _onError = (e) => {
    console.warn('[collab] socket error', e)
  }
}

/* ---------- Memory storage helper for Node.js ---------- */
function createMemoryOutbox () {
  const store = new Map()
  return {
    put: (item) => store.set(item.id, item),
    toArray: () => Array.from(store.values()),
    clear: () => store.clear()
  }
}

/* ---------- Dexie helper for browser ---------- */
async function createDexieOutbox (name) {
  const { default: Dexie } = await import('dexie')
  const db = new Dexie(`collab-${name}`)
  db.version(1).stores({ outbox: 'id, ops' })
  return db.table('outbox')
}