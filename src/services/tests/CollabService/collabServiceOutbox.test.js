// CollabService and the outbox of each room (2026-10-30). Every edit
// updateData makes goes through the outbox of its room; the socket events
// move it: the answer to 'ops', 'snapshot' (does the server answer ops?),
// 'commit' (the op ids it took), 'error' COMMIT_FAILED, and the connection.
//
// Before: updateData emitted 'ops' and forgot it. Ops made offline waited in
// one list (_pendingOps) and went to whatever room connected next.
//
// A fake socket stands in for socket.io: the test reads what was sent and
// fires the server's events. `join` runs what connect() runs once the socket
// is up (the room's outbox joins it); connect() itself, with the real
// CollabClient and socket.io, is in the live proof.
import test from 'tape'
import { CollabService } from '../../CollabService.js'
import { rootBus } from '../../../state/rootEventBus.js'

const CAPS = { opsAck: true, commitDeadlineMs: 90_000 }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fakeSocket () {
  const handlers = new Map()
  const sent = []
  const socket = {
    connected: true,
    on (event, fn) {
      if (!handlers.has(event)) { handlers.set(event, []) }
      handlers.get(event).push(fn)
      return socket
    },
    off (event, fn) {
      const list = handlers.get(event) || []
      const i = list.indexOf(fn)
      if (i >= 0) { list.splice(i, 1) }
      return socket
    },
    emit (event, payload) {
      sent.push({ event, payload, ack: null })
      return socket
    },
    timeout (ms) {
      return {
        emit: (event, payload, ack) => {
          sent.push({ event, payload, ack, timeoutMs: ms })
        }
      }
    },
    disconnect () {
      socket.connected = false
    },
    // The server's side.
    fire (event, ...args) {
      for (const fn of [...(handlers.get(event) || [])]) { fn(...args) }
    },
    drop (reason = 'transport close') {
      socket.connected = false
      socket.fire('disconnect', reason)
    },
    back (snapshot) {
      socket.connected = true
      socket.fire('connect')
      if (snapshot !== undefined) { socket.fire('snapshot', snapshot) }
    }
  }
  return { socket, sent }
}

function service () {
  const svc = new CollabService()
  svc.updateContext({
    state: {
      setPathCollection: async () => {},
      getByPath: () => undefined
    }
  })
  return svc
}

// What connect() runs for a room once its socket is up.
function join (svc, { projectId = 'p1', branch = 'main', caps = CAPS } = {}) {
  if (svc._client) { svc.disconnect() }
  svc._roomKey = null
  const { socket, sent } = fakeSocket()
  svc._context = { ...svc._context, projectId, branch }
  svc._client = { socket, collabCaps: caps }
  svc._attachSocketLifecycleListeners()
  svc._onSocketConnect()
  svc._joinRoomOutbox({ projectId, branch, socket })
  return { socket, sent }
}

// The root bus payloads of `event` from now on (the bus replays its last
// payload to a new listener at once: that one is not counted).
function listen (event) {
  const got = []
  const handler = (payload) => got.push(payload)
  rootBus.on(event, handler)
  got.length = 0
  return { got, stop: () => rootBus.off(event, handler) }
}

const edit = (svc, v) => svc.updateData([['update', ['pages', 'Home', 'text'], v]])
const ops = (sent) => sent.filter((s) => s.event === 'ops')
const texts = (sent) => ops(sent).map((s) => s.payload.changes.map((c) => c[2]))
const saved = (op, extra = {}) =>
  op.ack(null, { ok: true, opId: op.payload.opId, buffered: true, epoch: 'E1', ...extra })
const brief = (s) => `${s.state}/${s.unsaved}/${s.awaitingCommit}`
// The service lets go of its socket: no outbox timer (a commit deadline, a
// retry) outlives the test.
const done = (t, svc) => {
  svc.disconnect()
  t.end()
}

test('an edit goes through its room outbox: sent with an op id, saved on the answer, gone when a commit names it', (t) => {
  const svc = service()
  const { socket, sent } = join(svc)
  const states = listen('collab:saveState')

  t.deepEqual(edit(svc, 'v1'), { success: true }, 'accepted')
  t.equal(ops(sent).length, 1, 'one ops event')
  const [first] = ops(sent)
  t.ok(/^op-[a-z0-9]+-[0-9a-f]{24}$/.test(first.payload.opId), `an op id (${first.payload.opId})`)
  t.equal(first.payload.epoch, '', 'no epoch yet')
  t.equal(typeof first.ack, 'function', 'an answer is wanted')
  t.equal(first.timeoutMs, 10_000, 'within the ack timeout')
  t.equal(svc.getSaveState().state, 'saving')
  t.ok(svc.hasUnsavedOps(), 'unsaved while on its way')
  t.equal(svc.getConnectionInfo().pendingOps, 1, 'getConnectionInfo counts it')

  edit(svc, 'v2')
  t.equal(ops(sent).length, 1, 'the next op waits for the answer to the first')
  saved(first)
  t.equal(ops(sent).length, 2, 'then it goes')
  const second = ops(sent)[1]
  t.equal(second.payload.epoch, 'E1', 'with the epoch the server named')
  t.notEqual(second.payload.opId, first.payload.opId, 'its own op id')
  saved(second)
  t.equal(brief(svc.getSaveState()), 'saved/0/2', 'saved; both wait for a commit')
  t.notOk(svc.hasUnsavedOps(), 'nothing unsaved')

  socket.fire('commit', { version: 'v7', opIds: [first.payload.opId] })
  t.equal(svc.getSaveState().awaitingCommit, 1, 'the op the commit names leaves')
  t.equal(svc._stateManager.root.version, 'v7', 'the version moves')
  socket.fire('commit', { version: 'v8', branch: 'main', changes: 1, opIds: [second.payload.opId] })
  t.equal(brief(svc.getSaveState()), 'saved/0/0')

  t.deepEqual(
    states.got.map(brief),
    ['saving/1/0', 'saving/2/0', 'saving/1/1', 'saved/0/2', 'saved/0/1', 'saved/0/0'],
    'collab:saveState on each change'
  )
  t.ok(states.got.every((s) => s.room === 'p1:main'), 'each names the room')
  states.stop()
  done(t, svc)
})

test('offline: the edit waits in its room outbox and goes when the socket is back and the snapshot says the server answers ops', (t) => {
  const svc = service()
  const { socket, sent } = join(svc)
  socket.drop()
  t.equal(svc.getSaveState().state, 'saved', 'nothing to save yet')
  t.deepEqual(edit(svc, 'off-1'), { success: true, queued: true }, 'accepted and queued')
  t.equal(ops(sent).length, 0, 'nothing sent offline')
  t.equal(svc.getSaveState().state, 'not_saved')
  t.ok(svc.hasUnsavedOps())

  socket.back()
  t.equal(ops(sent).length, 0, 'not before the snapshot says how the server answers ops')
  socket.fire('snapshot', { data: [], collab: CAPS })
  t.deepEqual(texts(sent), [['off-1']], 'then it goes, once')
  saved(ops(sent)[0])
  t.equal(svc.getSaveState().state, 'saved')
  t.notOk(svc.hasUnsavedOps())
  done(t, svc)
})

test('a saved op that no commit named goes again after a reconnect, with the same op id; a duplicate answer keeps it until its commit', (t) => {
  const svc = service()
  const { socket, sent } = join(svc)
  edit(svc, 'r1')
  const [op] = ops(sent)
  saved(op)
  socket.drop()
  t.equal(svc.getSaveState().state, 'saved', 'a saved op stays saved offline')
  socket.back({ data: [], collab: CAPS })
  t.equal(ops(sent).length, 2, 'sent again on the reconnect')
  const again = ops(sent)[1]
  t.equal(again.payload.opId, op.payload.opId, 'with the same op id')
  t.equal(again.payload.epoch, 'E1', 'in the epoch it was saved in')
  saved(again, { duplicate: true })
  t.equal(brief(svc.getSaveState()), 'saved/0/1', 'saved, waits for its commit')
  socket.fire('commit', { version: 'v2', opIds: [op.payload.opId] })
  t.equal(brief(svc.getSaveState()), 'saved/0/0')
  done(t, svc)
})

test('no answer in time: the op shows not saved and goes again with the same op id', async (t) => {
  const svc = service()
  const { sent } = join(svc)
  edit(svc, 't1')
  const [op] = ops(sent)
  op.ack(new Error('operation has timed out'))
  const info = svc.getSaveState()
  t.equal(info.state, 'not_saved')
  t.equal(info.code, 'NO_ANSWER')
  t.ok(svc.hasUnsavedOps())
  await sleep(700)
  t.equal(ops(sent).length, 2, 'sent again after the backoff')
  t.equal(ops(sent)[1].payload.opId, op.payload.opId, 'with the same op id')
  saved(ops(sent)[1])
  t.equal(brief(svc.getSaveState()), 'saved/0/1')
  t.equal(svc.getSaveState().code, null, 'the code clears')
  done(t, svc)
})

test('the ops of one room never go to another room', (t) => {
  const svc = service()
  const a = join(svc, { projectId: 'pA' })
  a.socket.drop()
  edit(svc, 'a-offline')
  t.equal(ops(a.sent).length, 0, 'room A is offline')

  const b = join(svc, { projectId: 'pB' })
  t.equal(ops(b.sent).length, 0, 'room B gets nothing of room A')
  t.equal(svc.getSaveState().state, 'saved', 'room B has nothing to save')
  edit(svc, 'b-1')
  t.deepEqual(texts(b.sent), [['b-1']], 'room B gets its own op')
  saved(ops(b.sent)[0])
  t.equal(svc.getSaveState().state, 'saved')
  t.ok(svc.hasUnsavedOps(), 'room A still holds its op')

  const a2 = join(svc, { projectId: 'pA' })
  t.deepEqual(texts(a2.sent), [['a-offline']], 'it goes when room A is joined again')
  saved(ops(a2.sent)[0])
  t.notOk(svc.hasUnsavedOps())
  done(t, svc)
})

test('ops made before any room is known go to the first room joined', (t) => {
  const svc = service()
  const states = listen('collab:saveState')
  t.deepEqual(edit(svc, 'early'), { success: true, queued: true })
  t.equal(brief(svc.getSaveState()), 'not_saved/1/0')
  t.equal(states.got.at(-1)?.room, null, 'its save state names no room yet')
  const { sent } = join(svc, { projectId: 'p9' })
  t.deepEqual(texts(sent), [['early']])
  t.equal(states.got.at(-1)?.room, 'p9:main', 'then the room it went to')
  states.stop()
  done(t, svc)
})

test('an older server (its snapshot names no collab caps): each op goes once, with no op id and no answer wanted', (t) => {
  const svc = service()
  const { sent } = join(svc, { caps: null })
  edit(svc, 'old-1')
  const [op] = ops(sent)
  t.equal(op.ack, null, 'no answer wanted')
  t.equal(op.payload.opId, undefined, 'no op id')
  t.equal(op.payload.epoch, undefined, 'no epoch')
  t.deepEqual(texts(sent), [['old-1']])
  t.equal(brief(svc.getSaveState()), 'saved/0/0', 'forgotten, as before')
  t.equal(svc.getSaveState().mode, 'legacy')
  done(t, svc)
})

test('an op the server refuses for good leaves the outbox and is told on the root bus', (t) => {
  const svc = service()
  const { sent } = join(svc)
  const rejected = listen('collab:opRejected')
  edit(svc, 'nope')
  const [op] = ops(sent)
  op.ack(null, { ok: false, opId: op.payload.opId, code: 'OPS_FORBIDDEN', retryable: false })
  t.deepEqual(rejected.got, [{ opId: op.payload.opId, code: 'OPS_FORBIDDEN', room: 'p1:main' }])
  t.equal(brief(svc.getSaveState()), 'saved/0/0')
  rejected.stop()
  done(t, svc)
})

test("the server's COMMIT_FAILED shows on the save state until the next commit", (t) => {
  const svc = service()
  const { socket, sent } = join(svc)
  edit(svc, 'c1')
  const [op] = ops(sent)
  saved(op)
  socket.fire('error', { code: 'COMMIT_FAILED', message: 'Failed to persist changes' })
  t.equal(svc.getSaveState().commitFailed, true)
  t.equal(svc.getSaveState().state, 'saved', 'the op is still saved in the buffer')
  socket.fire('commit', { version: 'v3', opIds: [op.payload.opId] })
  t.equal(svc.getSaveState().commitFailed, false)
  t.equal(brief(svc.getSaveState()), 'saved/0/0')
  done(t, svc)
})
