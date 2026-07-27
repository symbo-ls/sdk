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
  t.plan(12)
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
  // snapshot + revoked have no consumer branch — must be swallowed.
  fire('meet.snapshot', { rooms: [{ id: 'r1' }] })
  fire('meet.revoked', { roomId: 'r1' })

  t.equal(received.length, 4, 'snapshot + revoked swallowed; 4 data events delivered')
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
