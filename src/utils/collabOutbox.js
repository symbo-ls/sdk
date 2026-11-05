// The collab outbox (2026-10-30): every edit CollabService.updateData sends waits here until the
// server has SAVED it in the room's buffer (its answer to the 'ops' event), and then until a
// 'commit' event names it. One op is in flight at a time, so the server saves this client's ops in
// the order they were made. An op is sent again, with the same op id, when the server answers
// "not saved, retry", when no answer comes in time, after a reconnect, and when it was saved but no
// commit named it within the server's deadline (`collab.commitDeadlineMs`). The server skips a copy
// by its op id, so a resend never applies twice.
//
// The server says it answers ops in its snapshot (`collab.opsAck`). With a server that does not
// (no `collab` in the snapshot, or no snapshot within `capsWaitMs`), each op is sent once and
// forgotten, as before.
//
// Answers from the server (packages/socket/collaborative.js on the server):
//   { ok: true, opId, buffered: true, epoch }                  saved (also `duplicate: true`)
//   { ok: true, opId, buffered: false[, committed: true] }    nothing to save / committed already
//   { ok: false, opId, code, retryable[, epoch] }              not saved
// EPOCH_LOST: the room's buffer is not the one this client saved its ops in (Redis lost it): every
// op not yet committed is sent again, in its order, with no epoch.
//
// Save state (what the canvas shows):
//   'saved'      every op is saved on the server (some may still wait for their commit)
//   'saving'     an op is on its way and nothing failed
//   'not_saved'  an op failed and waits to be sent again, or the socket is not connected

const DEFAULTS = {
  ackTimeoutMs: 10_000,
  retryMinMs: 500,
  retryMaxMs: 30_000,
  capsWaitMs: 3_000,
  maxBatchChanges: 200,
  commitDeadlineMs: 90_000
}

// An op id the server takes (its rule: 1-128 of A-Z a-z 0-9 _ . : -).
export function newOpId () {
  const bytes = new Uint8Array(12)
  const c = globalThis.crypto
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) { bytes[i] = Math.floor(Math.random() * 256) }
  }
  let hex = ''
  for (const b of bytes) { hex += b.toString(16).padStart(2, '0') }
  return `op-${Date.now().toString(36)}-${hex}`
}

const changeCount = (payload) =>
  Math.max(
    Array.isArray(payload?.granularChanges) ? payload.granularChanges.length : 0,
    Array.isArray(payload?.changes) ? payload.changes.length : 0
  )

const concat = (a, b) => [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]

export class CollabOutbox {
  /**
   * @param {object} p
   * @param {(payload: object, opts: null | { timeoutMs: number, ack: (err: any, answer: any) => void }) => void} p.emit
   *   send one 'ops' event (opts null: no answer wanted)
   * @param {(info: object) => void} [p.onState]     the save state changed
   * @param {(info: { opId: string, code: string }) => void} [p.onRejected]  an op the server refused for good
   */
  constructor ({
    emit,
    onState = null,
    onRejected = null,
    newId = newOpId,
    now = Date.now,
    setTimer = (fn, ms) => {
      const t = setTimeout(fn, ms)
      t?.unref?.()
      return t
    },
    clearTimer = clearTimeout,
    ...options
  } = {}) {
    this._emit = emit
    this._onState = onState
    this._onRejected = onRejected
    this._newId = newId
    this._now = now
    this._setTimer = setTimer
    this._clearTimer = clearTimer
    this._opts = { ...DEFAULTS, ...options }
    // { opId, payload, status: 'queued' | 'inflight' | 'acked', sent, attempts, retryAt, ackedAt, code }
    this._entries = []
    this._mode = 'unknown' // 'unknown' | 'ack' | 'legacy'
    this._connected = false
    this._epoch = ''
    this._attempt = 0 // the send in flight; an answer to an older one is not read
    this._timer = null
    this._capsTimer = null
    this._commitFailed = false
    this._last = ''
  }

  /* ---------- inputs ---------- */

  push (payload) {
    const entry = {
      opId: this._newId(),
      payload,
      status: 'queued',
      sent: false,
      attempts: 0,
      retryAt: 0,
      ackedAt: 0,
      code: null,
      resend: false
    }
    this._entries.push(entry)
    this._pump()
    return entry.opId
  }

  setConnected (connected) {
    const was = this._connected
    this._connected = Boolean(connected)
    if (!this._connected) {
      this._mode = 'unknown'
      this._stopCapsWait()
      this._attempt += 1
      for (const e of this._entries) {
        if (e.status === 'inflight') { e.status = 'queued' }
      }
    } else if (!was) {
      // A (re)connect: the commit that took a saved op may have come while away; send it again
      // (the server answers 'committed', or keeps it once).
      for (const e of this._entries) {
        if (e.status === 'acked') {
          e.status = 'queued'
          e.retryAt = 0
          e.resend = true
        }
      }
      if (this._mode === 'unknown') { this._startCapsWait() }
    }
    this._pump()
  }

  // The snapshot's `collab` (undefined: no snapshot yet; null: a server that does not answer ops).
  setCaps (caps) {
    if (caps === undefined) { return }
    this._stopCapsWait()
    if (caps && caps.opsAck === true) {
      this._mode = 'ack'
      if (Number.isFinite(caps.commitDeadlineMs) && caps.commitDeadlineMs > 0) {
        this._opts.commitDeadlineMs = caps.commitDeadlineMs
      }
    } else {
      this._mode = 'legacy'
    }
    this._pump()
  }

  // A 'commit' event: the ops it names are committed.
  onCommit (opIds) {
    this._commitFailed = false
    if (Array.isArray(opIds) && opIds.length) {
      const named = new Set(opIds)
      if (this._entries.some((e) => e.status === 'inflight' && named.has(e.opId))) {
        this._attempt += 1
      }
      this._entries = this._entries.filter((e) => !named.has(e.opId))
    }
    this._pump()
  }

  // The server's 'error' COMMIT_FAILED: saved ops wait for a commit that failed (the server retries).
  onCommitFailed () {
    this._commitFailed = true
    this._report()
  }

  // Take over the ops of another outbox (ops made before a room was known), after this one's.
  adopt (other) {
    if (!other || other === this) { return }
    for (const e of other._entries) {
      this._entries.push({ ...e, status: e.status === 'acked' ? 'acked' : 'queued' })
    }
    other._entries = []
    other.dispose()
    this._pump()
  }

  dispose () {
    this._stopCapsWait()
    if (this._timer) {
      this._clearTimer(this._timer)
      this._timer = null
    }
    this._attempt += 1
  }

  /* ---------- outputs ---------- */

  get state () {
    const unsaved = this._entries.filter((e) => e.status !== 'acked')
    if (!unsaved.length) { return 'saved' }
    if (!this._connected || unsaved.some((e) => e.attempts > 0)) { return 'not_saved' }
    return 'saving'
  }

  hasUnsavedOps () {
    return this._entries.some((e) => e.status !== 'acked')
  }

  info () {
    const failing = this._entries.find((e) => e.status !== 'acked' && e.attempts > 0)
    return {
      state: this.state,
      unsaved: this._entries.filter((e) => e.status !== 'acked').length,
      awaitingCommit: this._entries.filter((e) => e.status === 'acked').length,
      code: failing?.code || null,
      commitFailed: this._commitFailed,
      mode: this._mode
    }
  }

  /* ---------- the pump ---------- */

  _pump () {
    if (this._timer) {
      this._clearTimer(this._timer)
      this._timer = null
    }
    if (this._connected && this._mode === 'legacy') {
      // As before: each op once, no answer. An op a server already saved is not sent to one that
      // cannot tell a copy (a rollback to an older server).
      const sendable = this._entries.filter((e) => e.status !== 'acked' && !e.resend)
      this._entries = []
      for (const e of sendable) { this._emit(e.payload, null) }
    } else if (this._connected && this._mode === 'ack' && !this._entries.some((e) => e.status === 'inflight')) {
      const now = this._now()
      for (const e of this._entries) {
        if (e.status === 'acked' && now - e.ackedAt >= this._opts.commitDeadlineMs) {
          e.status = 'queued'
          e.retryAt = 0
          e.resend = true
        }
      }
      const next = this._entries.find((e) => e.status === 'queued')
      if (!next) {
        const acked = this._entries.filter((e) => e.status === 'acked')
        if (acked.length) {
          const due = Math.min(...acked.map((e) => e.ackedAt + this._opts.commitDeadlineMs))
          this._schedule(due - now)
        }
      } else if (next.retryAt > now) {
        this._schedule(next.retryAt - now)
      } else {
        if (!next.sent) { this._coalesce(next) }
        this._send(next)
      }
    }
    this._report()
  }

  _schedule (ms) {
    this._timer = this._setTimer(() => {
      this._timer = null
      this._pump()
    }, Math.max(0, ms))
  }

  // Ops not sent yet that follow `head` go with it as one op: the order holds, and a fast typist's
  // edits do not wait one round trip each. A batch carries one message at most (its last op's).
  _coalesce (head) {
    if (head.payload?.message) { return }
    let count = changeCount(head.payload)
    const start = this._entries.indexOf(head) + 1
    let end = start
    while (end < this._entries.length) {
      const e = this._entries[end]
      if (e.status !== 'queued' || e.sent || e.attempts > 0) { break }
      const n = changeCount(e.payload)
      if (count + n > this._opts.maxBatchChanges) { break }
      count += n
      end += 1
      if (e.payload?.message) { break }
    }
    if (end === start) { return }
    const merged = { ...head.payload }
    for (const e of this._entries.slice(start, end)) {
      merged.changes = concat(merged.changes, e.payload.changes)
      merged.granularChanges = concat(merged.granularChanges, e.payload.granularChanges)
      merged.orders = concat(merged.orders, e.payload.orders)
      if (e.payload.ts) { merged.ts = e.payload.ts }
      if (e.payload.message) { merged.message = e.payload.message }
    }
    head.payload = merged
    this._entries.splice(start, end - start)
  }

  _send (entry) {
    entry.status = 'inflight'
    entry.sent = true
    this._attempt += 1
    const attempt = this._attempt
    this._emit(
      { ...entry.payload, opId: entry.opId, epoch: this._epoch },
      {
        timeoutMs: this._opts.ackTimeoutMs,
        ack: (err, answer) => this._onAnswer(attempt, entry, err, answer)
      }
    )
  }

  _onAnswer (attempt, entry, err, answer) {
    if (attempt !== this._attempt || entry.status !== 'inflight') { return }
    if (err || !answer || typeof answer !== 'object') {
      this._retry(entry, 'NO_ANSWER')
      return
    }
    if (answer.ok === true) {
      if (typeof answer.epoch === 'string' && answer.epoch) { this._epoch = answer.epoch }
      if (answer.buffered === true) {
        entry.status = 'acked'
        entry.ackedAt = this._now()
        entry.attempts = 0
        entry.code = null
        entry.resend = false
      } else {
        this._entries = this._entries.filter((e) => e !== entry)
      }
      this._pump()
      return
    }
    if (answer.code === 'EPOCH_LOST') {
      // The server lost them: each must be saved again (not a resend of a saved op).
      this._epoch = ''
      for (const e of this._entries) {
        e.status = 'queued'
        e.retryAt = 0
        e.resend = false
      }
      this._pump()
      return
    }
    if (answer.retryable === true) {
      this._retry(entry, answer.code)
      return
    }
    this._entries = this._entries.filter((e) => e !== entry)
    if (this._onRejected) { this._onRejected({ opId: entry.opId, code: answer.code || 'REFUSED' }) }
    this._pump()
  }

  _retry (entry, code) {
    entry.status = 'queued'
    entry.attempts += 1
    entry.code = code || 'OPS_NOT_SAVED'
    entry.retryAt =
      this._now() + Math.min(this._opts.retryMaxMs, this._opts.retryMinMs * 2 ** (entry.attempts - 1))
    this._pump()
  }

  _startCapsWait () {
    this._stopCapsWait()
    this._capsTimer = this._setTimer(() => {
      this._capsTimer = null
      if (this._connected && this._mode === 'unknown') {
        this._mode = 'legacy'
        this._pump()
      }
    }, this._opts.capsWaitMs)
  }

  _stopCapsWait () {
    if (this._capsTimer) {
      this._clearTimer(this._capsTimer)
      this._capsTimer = null
    }
  }

  _report () {
    if (!this._onState) { return }
    const info = this.info()
    const key = `${info.state}|${info.unsaved}|${info.awaitingCommit}|${info.code}|${info.commitFailed}`
    if (key === this._last) { return }
    this._last = key
    this._onState(info)
  }
}
