import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Meet room member remove + transcript delete (CRUD sweep item 6,
// 2026-11-01). Worker routes (workspace-project):
//   DELETE /meet/rooms/:id/members/:userId — the room host, an owner/admin of
//     the ROOM's workspace or a platform admin; the last host stays (409
//     `last_room_host`); the person's open call session ends with the row.
//   DELETE /meet/rooms/:id/transcripts — the same people; deletes every
//     utterance and the analysis built from them, answers the counts.
// Both act on the room's own workspace, so they carry no ?workspaceId=.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = { activeWorkspaceId: 'ws-active' }
  return svc
}

test.onFinish(() => sandbox.restore())

test('meet.removeMember DELETEs /meet/rooms/:id/members/:userId', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_ws').resolves({ removed: 1 })
  const out = await svc.meet.removeMember('room/1', 'user 2')
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'meet.removeMember', 'method name')
  t.equal(path, '/meet/rooms/room%2F1/members/user%202', 'both ids encoded; no workspace query')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.deepEqual(out, { removed: 1 }, 'the worker answer passes through')
  sandbox.restore()
  t.end()
})

test('meet.deleteTranscript DELETEs /meet/rooms/:id/transcripts', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_ws').resolves({ room_id: 'room1', utterances: 12, analyses: 1 })
  const out = await svc.meet.deleteTranscript('room1')
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'meet.deleteTranscript', 'method name')
  t.equal(path, '/meet/rooms/room1/transcripts', 'path')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.deepEqual(out, { room_id: 'room1', utterances: 12, analyses: 1 }, 'the deleted counts come back')
  sandbox.restore()
  t.end()
})

test('meet.removeMember passes the 409 last_room_host refusal through unchanged', async t => {
  const svc = makeService()
  const refusal = new Error('the last host stays')
  refusal.status = 409
  refusal.code = 'last_room_host'
  sandbox.stub(svc, '_ws').rejects(refusal)
  try {
    await svc.meet.removeMember('room1', 'host1')
    t.fail('removeMember should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
  }
  sandbox.restore()
  t.end()
})

test('meet.removeMember and meet.deleteTranscript need their ids', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_ws').resolves({})
  const cases = [
    ['removeMember', () => svc.meet.removeMember('', 'u1'), /room/i],
    ['removeMember', () => svc.meet.removeMember('room1', ''), /user/i],
    ['deleteTranscript', () => svc.meet.deleteTranscript(''), /room/i]
  ]
  for (const [label, run, re] of cases) {
    try {
      await run()
      t.fail(`${label} without an id should throw`)
    } catch (err) {
      t.match(String(err.message), re, `${label}: names the missing id`)
    }
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute maps meet members 'remove' and meet transcripts 'remove'", async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_ws').resolves({})
  const execute = createEntityDispatcher({ getService: (name) => (name === 'workspaceProject' ? svc : null) })
  await execute('workspaceProject.meet.members', 'remove', { roomId: 'room1', userId: 'u1' })
  await execute('workspaceProject.meet.transcripts', 'remove', { roomId: 'room1' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1], c.args[2].method]), [
    ['meet.removeMember', '/meet/rooms/room1/members/u1', 'DELETE'],
    ['meet.deleteTranscript', '/meet/rooms/room1/transcripts', 'DELETE']
  ])
  sandbox.restore()
  t.end()
})
