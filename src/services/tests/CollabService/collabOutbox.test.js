// The collab outbox (utils/collabOutbox.js, 2026-10-30): an edit stays in the
// client until the server has SAVED it, and then until a commit names it.
//
// Before: CollabService.updateData emitted 'ops' and forgot it. In a server
// Redis cut the op was saved nowhere and the author never knew; ops made
// offline were flushed into whatever room connected next.
//
// The server here is the test: each send waits in `sent` with its answer
// function, and the clock and timers move only when the test moves them.
import test from 'tape'
import { CollabOutbox, newOpId } from '../../../utils/collabOutbox.js'

function fakeTime () {
  let now = 1_000_000
  let seq = 0
  const timers = new Map()
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      seq += 1
      timers.set(seq, { at: now + ms, fn })
      return seq
    },
    clearTimer: (id) => {
      timers.delete(id)
    },
    advance (ms) {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) { break }
        now = due[1].at
        timers.delete(due[0])
        due[1].fn()
      }
      now = end
    }
  }
}

function harness (options = {}) {
  const time = fakeTime()
  const sent = []
  const states = []
  const rejected = []
  let n = 0
  const outbox = new CollabOutbox({
    emit: (payload, opts) => sent.push({ payload, ack: opts?.ack || null, timeoutMs: opts?.timeoutMs }),
    onState: (info) => states.push(info),
    onRejected: (info) => rejected.push(info),
    newId: () => {
      n += 1
      return `op-${n}`
    },
    now: time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    ...options
  })
  return { outbox, sent, states, rejected, time }
}

const CAPS = { opsAck: true, commitDeadlineMs: 90_000 }
const op = (v, extra = {}) => ({
  changes: [['update', ['pages', 'Home', 'text'], v]],
  granularChanges: [['update', ['pages', 'Home', 'text'], v]],
  orders: [],
  ts: 1,
  ...extra
})
const saved = (epoch = 'E1', extra = {}) => ({ ok: true, buffered: true, epoch, ...extra })
const texts = (payload) => payload.granularChanges.map((c) => c[2])

function connected (options) {
  const h = harness(options)
  h.outbox.setConnected(true)
  h.outbox.setCaps(CAPS)
  return h
}

test('newOpId: an id the server takes', (t) => {
  const ids = new Set(Array.from({ length: 50 }, () => newOpId()))
  t.equal(ids.size, 50, 'unique')
  for (const id of ids) { t.ok(/^[A-Za-z0-9_.:-]{1,128}$/.test(id), id) }
  t.end()
})

test('nothing goes before the server says it answers ops; then one op at a time, in order, with its op id and the epoch it learned', (t) => {
  const h = harness()
  h.outbox.push(op('a'))
  t.equal(h.sent.length, 0, 'offline: kept')
  t.equal(h.outbox.state, 'not_saved', 'offline with an op: not saved')
  h.outbox.setConnected(true)
  t.equal(h.sent.length, 0, 'connected, no snapshot yet: kept')
  h.outbox.setCaps(CAPS)
  t.equal(h.sent.length, 1, 'one op sent')
  t.deepEqual(texts(h.sent[0].payload), ['a'])
  t.equal(h.sent[0].payload.opId, 'op-1')
  t.equal(h.sent[0].payload.epoch, '', 'no epoch yet')
  t.ok(h.sent[0].ack, 'an answer is asked for')
  t.equal(h.outbox.state, 'saving')
  h.outbox.push(op('b'))
  h.outbox.push(op('c'))
  t.equal(h.sent.length, 1, 'the next waits for the answer to the first')
  h.sent[0].ack(null, saved('E1'))
  t.equal(h.sent.length, 2, 'then the next goes')
  t.deepEqual(texts(h.sent[1].payload), ['b', 'c'], 'ops not sent yet go as one, in order')
  t.equal(h.sent[1].payload.opId, 'op-2')
  t.equal(h.sent[1].payload.epoch, 'E1', 'the epoch the server named')
  h.sent[1].ack(null, saved('E1'))
  t.equal(h.outbox.state, 'saved')
  t.equal(h.outbox.info().awaitingCommit, 2, 'saved, the commit is still to come')
  t.equal(h.outbox.hasUnsavedOps(), false)
  h.outbox.onCommit(['op-1'])
  t.equal(h.outbox.info().awaitingCommit, 1)
  h.outbox.onCommit(['op-2', 'op-99'])
  t.equal(h.outbox.info().awaitingCommit, 0, 'a commit takes the ops it names')
  t.end()
})

test('"not saved, retry": the same op id again after a backoff that doubles; the state says not_saved with the code', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, { ok: false, opId: 'op-1', code: 'OPS_NOT_SAVED', retryable: true })
  t.equal(h.outbox.state, 'not_saved')
  t.equal(h.outbox.info().code, 'OPS_NOT_SAVED')
  t.equal(h.outbox.hasUnsavedOps(), true)
  h.time.advance(499)
  t.equal(h.sent.length, 1, 'not before the backoff')
  h.time.advance(1)
  t.equal(h.sent.length, 2, 'sent again')
  t.equal(h.sent[1].payload.opId, 'op-1', 'with the same op id')
  h.sent[1].ack(null, { ok: false, code: 'OPS_NOT_SAVED', retryable: true })
  h.time.advance(999)
  t.equal(h.sent.length, 2, 'the second backoff is longer')
  h.time.advance(1)
  t.equal(h.sent.length, 3)
  h.sent[2].ack(null, saved())
  t.equal(h.outbox.state, 'saved')
  t.equal(h.outbox.info().code, null)
  t.end()
})

test('an op that waits for its retry holds the ones after it (the order holds)', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, { ok: false, code: 'RATE_LIMITED', retryable: true })
  h.outbox.push(op('b'))
  t.equal(h.sent.length, 1, 'b does not overtake a')
  h.time.advance(500)
  t.equal(h.sent.length, 2)
  t.deepEqual(texts(h.sent[1].payload), ['a'], 'a, alone: it was sent before, so nothing joins it')
  h.sent[1].ack(null, saved())
  t.deepEqual(texts(h.sent[2].payload), ['b'])
  t.end()
})

test('no answer in time is a retry; a late answer to the old send is not read', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  t.equal(h.sent[0].timeoutMs, 10_000, 'the answer is waited for 10 s')
  h.sent[0].ack(new Error('operation has timed out'))
  t.equal(h.outbox.state, 'not_saved')
  t.equal(h.outbox.info().code, 'NO_ANSWER')
  h.time.advance(500)
  t.equal(h.sent.length, 2)
  h.sent[0].ack(null, saved())
  t.equal(h.outbox.info().awaitingCommit, 0, 'the late answer to the first send changed nothing')
  t.equal(h.outbox.state, 'not_saved', 'an op that failed stays "not saved" until it is saved')
  h.sent[1].ack(null, saved())
  t.equal(h.outbox.state, 'saved')
  t.end()
})

test('EPOCH_LOST (the server lost its buffer): every op not committed is sent again, in its order, with no epoch', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved('E1'))
  h.outbox.push(op('b'))
  h.sent[1].ack(null, saved('E1'))
  h.outbox.onCommit(['op-1'])
  h.outbox.push(op('c'))
  t.equal(h.sent[2].payload.epoch, 'E1')
  h.sent[2].ack(null, { ok: false, opId: 'op-3', code: 'EPOCH_LOST', retryable: true, epoch: '' })
  t.equal(h.sent.length, 4, 'sent again at once')
  t.equal(h.sent[3].payload.opId, 'op-2', 'the oldest op not committed first (op-1 was committed)')
  t.equal(h.sent[3].payload.epoch, '', 'with no epoch')
  h.sent[3].ack(null, saved('E2'))
  t.equal(h.sent[4].payload.opId, 'op-3')
  t.equal(h.sent[4].payload.epoch, 'E2', 'the new epoch')
  h.sent[4].ack(null, saved('E2'))
  t.equal(h.outbox.state, 'saved')
  t.equal(h.outbox.info().awaitingCommit, 2)
  t.end()
})

test('a saved op that no commit named within the deadline is sent again; "committed" drops it', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved())
  h.time.advance(89_999)
  t.equal(h.sent.length, 1, 'not before the deadline')
  h.time.advance(1)
  t.equal(h.sent.length, 2, 'sent again at the deadline')
  t.equal(h.sent[1].payload.opId, 'op-1')
  h.sent[1].ack(null, { ok: true, opId: 'op-1', buffered: false, committed: true, epoch: 'E1' })
  t.equal(h.outbox.info().awaitingCommit, 0, 'committed: it leaves the outbox')
  t.equal(h.outbox.state, 'saved')
  t.end()
})

test("the deadline follows the server's word (collab.commitDeadlineMs); a copy still pending waits another deadline", (t) => {
  const h = harness()
  h.outbox.setConnected(true)
  h.outbox.setCaps({ opsAck: true, commitDeadlineMs: 5_000 })
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved())
  h.time.advance(5_000)
  t.equal(h.sent.length, 2)
  h.sent[1].ack(null, saved('E1', { duplicate: true }))
  h.time.advance(4_999)
  t.equal(h.sent.length, 2)
  h.time.advance(1)
  t.equal(h.sent.length, 3)
  t.end()
})

test('a reconnect sends the saved ops no commit named yet again, before the new ones; an op in flight at the cut goes again', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved())
  h.outbox.push(op('b'))
  t.equal(h.sent.length, 2, 'b in flight')
  h.outbox.setConnected(false)
  h.sent[1].ack(null, saved())
  t.equal(h.outbox.state, 'not_saved', 'the answer to a send before the cut is not read')
  h.outbox.push(op('c'))
  h.outbox.setConnected(true)
  t.equal(h.sent.length, 2, 'waits for the snapshot of the new connection')
  h.outbox.setCaps(CAPS)
  t.equal(h.sent[2].payload.opId, 'op-1', 'the saved op first (its commit may have come while away)')
  h.sent[2].ack(null, { ok: true, buffered: false, committed: true })
  t.equal(h.sent[3].payload.opId, 'op-2', 'then the op that was in flight')
  t.deepEqual(texts(h.sent[3].payload), ['b'], 'alone: it was sent before')
  h.sent[3].ack(null, saved())
  t.deepEqual(texts(h.sent[4].payload), ['c'])
  t.end()
})

test('an op the server refuses for good is dropped and told; the next one goes', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, { ok: false, opId: 'op-1', code: 'INVALID_ORDERS', retryable: false })
  t.deepEqual(h.rejected, [{ opId: 'op-1', code: 'INVALID_ORDERS' }])
  t.equal(h.outbox.state, 'saved', 'nothing left to save')
  h.outbox.push(op('b'))
  t.equal(h.sent[1].payload.opId, 'op-2')
  t.end()
})

test('"nothing to save" (buffered: false) drops the op', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, { ok: true, opId: 'op-1', buffered: false })
  t.equal(h.outbox.info().awaitingCommit, 0)
  t.equal(h.outbox.state, 'saved')
  t.end()
})

test('a server that does not answer ops (no collab in the snapshot): each op once, no answer asked, no op id, as before', (t) => {
  const h = harness()
  h.outbox.push(op('a'))
  h.outbox.setConnected(true)
  h.outbox.setCaps(null)
  t.equal(h.sent.length, 1)
  t.equal(h.sent[0].ack, null, 'no answer asked')
  t.equal(h.sent[0].payload.opId, undefined)
  t.equal(h.outbox.state, 'saved', 'forgotten once sent')
  h.outbox.push(op('b'))
  t.equal(h.sent.length, 2, 'the next op goes at once')
  t.end()
})

test('no snapshot within capsWaitMs: the ops go as before', (t) => {
  const h = harness()
  h.outbox.setConnected(true)
  h.outbox.push(op('a'))
  h.time.advance(2_999)
  t.equal(h.sent.length, 0)
  h.time.advance(1)
  t.equal(h.sent.length, 1)
  t.equal(h.sent[0].ack, null)
  t.end()
})

test('an older server after a reconnect gets no copy of an op the newer one saved', (t) => {
  const h = connected()
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved())
  h.outbox.push(op('b'))
  h.sent[1].ack(null, { ok: false, code: 'OPS_NOT_SAVED', retryable: true })
  h.outbox.setConnected(false)
  h.outbox.setConnected(true)
  h.outbox.setCaps(null)
  t.deepEqual(
    h.sent.slice(2).map((s) => texts(s.payload)),
    [['b']],
    'only the op never saved goes (an older server cannot tell a copy)'
  )
  t.end()
})

test('a batch carries one message at most: a message ends it; a batch is bounded by maxBatchChanges', (t) => {
  const h = connected({ maxBatchChanges: 3 })
  h.outbox.push(op('a'))
  h.outbox.push(op('b'))
  h.outbox.push(op('c', { message: 'Rename' }))
  h.outbox.push(op('d'))
  h.outbox.push(op('e'))
  h.outbox.push(op('f'))
  h.outbox.push(op('g'))
  h.sent[0].ack(null, saved())
  t.deepEqual(texts(h.sent[1].payload), ['b', 'c'], 'the op with a message ends the batch')
  t.equal(h.sent[1].payload.message, 'Rename')
  h.sent[1].ack(null, saved())
  t.deepEqual(texts(h.sent[2].payload), ['d', 'e', 'f'], 'at most 3 changes')
  t.equal(h.sent[2].payload.message, undefined)
  h.sent[2].ack(null, saved())
  t.deepEqual(texts(h.sent[3].payload), ['g'])
  t.end()
})

test('the save state is reported when it changes (saving, saved, not_saved, commitFailed)', (t) => {
  const h = connected()
  const from = h.states.length
  h.outbox.push(op('a'))
  h.sent[0].ack(null, saved())
  h.outbox.onCommitFailed()
  h.outbox.onCommit(['op-1'])
  t.deepEqual(
    h.states.slice(from).map((s) => [s.state, s.unsaved, s.awaitingCommit, s.commitFailed]),
    [
      ['saving', 1, 0, false],
      ['saved', 0, 1, false],
      ['saved', 0, 1, true],
      ['saved', 0, 0, false]
    ]
  )
  t.end()
})

test('adopt: ops made before a room was known go after the room’s own', (t) => {
  const early = harness({ newId: () => 'early-1' })
  early.outbox.push(op('early'))
  const h = connected()
  h.outbox.push(op('own'))
  h.outbox.adopt(early.outbox)
  h.sent[0].ack(null, saved())
  t.deepEqual(texts(h.sent[1].payload), ['early'])
  t.equal(h.sent[1].payload.opId, 'early-1', 'with its own op id')
  t.equal(early.outbox.hasUnsavedOps(), false, 'the other outbox is empty')
  t.end()
})
