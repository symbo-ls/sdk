import { io } from 'socket.io-client'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import Dexie from 'dexie'
import { nanoid } from 'nanoid'
import environment from '../config/environment.js'
// import gzip from 'gzip-js' // reserved for future compression features

// diff / patch helpers
import { diffJson, applyOpsToJson } from './jsonDiff.js'

/* eslint-disable no-use-before-define, no-new, no-promise-executor-return */

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
  _outboxStore = null // Dexie table
  _readyResolve
  ready = new Promise(res => (this._readyResolve = res))

  constructor ({ jwt, projectId, branch = 'main', live = false }) {
    Object.assign(this, { jwt, projectId, branch, live })

    /* 1️⃣  create Yjs doc + offline persistence */
    this.ydoc = new Y.Doc()
    new IndexeddbPersistence(`${projectId}:${branch}`, this.ydoc)

    /* 2️⃣  init Dexie for outbox */
    this._outboxStore = createDexieOutbox(`${projectId}:${branch}`)

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
      .on('liveMode', flag => { this.live = flag })
      .on('connect', this._onConnect)
      .on('error', e => console.warn('[collab] socket error', e))

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
    // first paint; trust server compressed payload (≤256 kB)
    Y.applyUpdate(this.ydoc, Uint8Array.from(data))

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
}

/* ---------- Dexie helper ---------- */
function createDexieOutbox (name) {
  const db = new Dexie(`collab-${name}`)
  db.version(1).stores({ outbox: 'id, ops' })
  return db.table('outbox')
}