import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// Meet realtime SSE cutover (spec §4) — verifies the SDK's server-SSE meet
// subscription:
//   (a) routes through the generalized `_sseSubscribe` at `/meet/stream`,
//       FLAT query params (the meet route reads req.query.roomId/tables, not
//       filter[...]), and the `meet.<kind>.<verb>` event vocabulary; and
//   (b) re-frames each SSE event envelope back into the SAME (kind, payload)
//       + snake_case `{eventType,new,old}` contract the Supabase path emitted,
//       so the consumer (`subscribeMeetRealtime.js`) stays byte-unchanged.

const sandbox = sinon.createSandbox()
const makeService = () => new WorkspaceProjectService()

test('realtime.subscribeMeetSse calls _sseSubscribe with /meet/stream + flatParams + meet events', t => {
  t.plan(8)
  const svc = makeService()
  const unsubMock = () => {}
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(unsubMock)

  const unsub = svc.realtime.subscribeMeetSse(
    { roomId: 'room-1', tables: ['meet_rooms', 'meet_transcripts'] },
    () => {}
  )

  t.equal(stub.calledOnce, true, '_sseSubscribe called once')
  const [path, filter, onEvent, opts] = stub.firstCall.args
  t.equal(path, '/meet/stream', 'path is /meet/stream')
  t.equal(filter.roomId, 'room-1', 'roomId forwarded flat')
  t.equal(filter.tables, 'meet_rooms,meet_transcripts', 'tables serialized as CSV string')
  t.equal(typeof onEvent, 'function', 'onEvent adapter is a function')
  t.equal(opts.flatParams, true, 'flatParams:true so server reads req.query.roomId/tables')
  t.ok(
    Array.isArray(opts.events) && opts.events.some((e) => e.name === 'meet.room.insert'),
    'meet event vocabulary supplied'
  )
  t.equal(unsub, unsubMock, 'returns the unsubscribe fn from _sseSubscribe')
  sandbox.restore()
  t.end()
})

test('subscribeMeetSse re-frames SSE envelopes to (kind, payload) — contract preserved', t => {
  t.plan(14)
  const svc = makeService()

  // Capture the event descriptors + the onEvent adapter that _sseSubscribe
  // would drive, then feed each event's parsed `data` through its frame and
  // assert the (kind, payload) the consumer receives.
  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })

  const received = []
  svc.realtime.subscribeMeetSse({ roomId: 'room-1' }, (kind, payload) => {
    received.push({ kind, payload })
  })

  const fire = (name, data) => {
    const desc = captured.events.find((e) => e.name === name)
    t.ok(desc, `event ${name} is registered`)
    const framed = desc.frame(data, name)
    // _sseSubscribe calls onEvent(framed) once per frame (when defined).
    if (framed !== undefined) captured.onEvent(framed)
  }

  // Server sends data ALREADY as { eventType, new, old } (snake_case rows).
  fire('meet.room.update', { eventType: 'UPDATE', new: { id: 'r1', room_id: 'r1', created_by: 'u1' } })
  fire('meet.transcript.insert', { eventType: 'INSERT', new: { id: 't1', room_id: 'r1', speaker_name: 'a@b.com' } })
  fire('meet.waiting.delete', { eventType: 'DELETE', old: { id: 'w1', room_id: 'r1' } })
  fire('meet.analysis.update', { eventType: 'UPDATE', new: { id: 'an1', room_id: 'r1' } })
  // snapshot is now forwarded (tickets/opus.md fix — it used to be swallowed
  // alongside revoked); revoked still has no consumer branch.
  fire('meet.snapshot', { rooms: [{ id: 'r1' }] })
  fire('meet.revoked', { roomId: 'r1' })

  t.equal(received.length, 5, 'revoked swallowed; 5 events delivered (incl. snapshot)')
  t.deepEqual(received[0], {
    kind: 'room',
    payload: { eventType: 'UPDATE', new: { id: 'r1', room_id: 'r1', created_by: 'u1' } }
  }, 'room: snake_case {eventType,new} passed through verbatim')
  t.deepEqual(received[1].kind, 'transcript', 'transcript.insert → kind=transcript')
  t.deepEqual(received[1].payload.new.speaker_name, 'a@b.com', 'snake_case columns preserved')
  t.deepEqual(received[2], {
    kind: 'waiting',
    payload: { eventType: 'DELETE', old: { id: 'w1', room_id: 'r1' } }
  }, 'waiting delete → {eventType:DELETE, old}')
  t.equal(received[3].kind, 'analysis', 'analysis.update → kind=analysis')
  t.equal(received[4].kind, 'meet.snapshot', 'snapshot → kind=meet.snapshot (was swallowed before this fix)')
  t.deepEqual(received[4].payload, { rooms: [{ id: 'r1' }] }, 'snapshot payload passed through verbatim')

  sandbox.restore()
  t.end()
})

// tickets/opus.md "`meet` realtime discards the server's meet.snapshot, so a
// reconnect recovers nothing" — the SDK-layer half of the acceptance bar.
// MeetStreamController.stream writes `meet.snapshot` unconditionally on
// EVERY invocation (every EventSource connect, first AND reconnect — see the
// doc comment on subscribeMeetSse), so the frame-level forwarding must not
// special-case "first time only". Proven here by firing the SAME event name
// twice with DIFFERENT data (simulating first-connect then a forced
// reconnect) and asserting both are delivered — a frame function has no
// per-call state, so this also guards against a future regression that
// tries to add first-call-only logic.
test('subscribeMeetSse forwards meet.snapshot on EVERY occurrence, not just the first — a reconnect is not silently dropped', t => {
  t.plan(3)
  const svc = makeService()
  let captured = null
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, opts) => {
    captured = { onEvent, events: opts.events }
    return () => {}
  })

  const received = []
  svc.realtime.subscribeMeetSse({ roomId: 'room-1' }, (kind, payload) => {
    received.push({ kind, payload })
  })

  const fireSnapshot = (data) => {
    const desc = captured.events.find((e) => e.name === 'meet.snapshot')
    const framed = desc.frame(data, 'meet.snapshot')
    if (framed !== undefined) captured.onEvent(framed)
  }

  // First connect.
  fireSnapshot({ rooms: [{ id: 'r1' }] })
  // Forced reconnect — a second room (r2) was created during the outage;
  // the reconnect's snapshot is the ONLY signal carrying it (no
  // meet.room.insert is ever fired for it in this test).
  fireSnapshot({ rooms: [{ id: 'r1' }, { id: 'r2' }] })

  t.equal(received.length, 2, 'both snapshots delivered — not just the first')
  t.deepEqual(received[0].payload, { rooms: [{ id: 'r1' }] }, 'first-connect snapshot')
  t.deepEqual(received[1].payload, { rooms: [{ id: 'r1' }, { id: 'r2' }] }, 'reconnect snapshot carries r2, written during the gap')

  sandbox.restore()
  t.end()
})

test('subscribeMeetSse forwards workspaceId (list view) and omits roomId when absent', t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  svc.realtime.subscribeMeetSse({ workspaceId: 'ws-1', tables: ['meet_rooms'] }, () => {})
  const filter = stub.firstCall.args[1]
  t.equal(filter.workspaceId, 'ws-1', 'workspaceId forwarded for list view')
  t.equal(filter.roomId, undefined, 'no roomId in list view')
  t.equal(filter.tables, 'meet_rooms', 'tables CSV present')
  sandbox.restore()
  t.end()
})

test('subscribeMeetSse returns a noop unsub when callback is not a function', t => {
  t.plan(1)
  const svc = makeService()
  const unsub = svc.realtime.subscribeMeetSse({ roomId: 'r1' }, null)
  t.equal(typeof unsub, 'function', 'noop unsub returned (no throw)')
  t.end()
})
