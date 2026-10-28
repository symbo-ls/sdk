import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// meet "apply suggestion" — the transcript page writes the analysis row's
// applied items. The wrapper called the workspace-project worker
// (PATCH /workspace-project/meet/rooms/:id/analysis/applied-items), a route
// the worker never had: dev answered 404 "no workspace route", so every
// "apply" failed with a console warning. The server route is
// PATCH /core/meet/rooms/:id/analysis/applied-items, body { appliedItems }.
//
// Two of the three workspace callers (applySuggestion, markSuggestionApplied)
// send { roomId, payload: { applied_items: [...] } }; the third
// (TranscriptPage) sends { roomId, appliedItems: [...] }. The server needs an
// ARRAY, so the dispatcher must unwrap the payload object.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = { activeWorkspaceId: 'ws-ctx' }
  return svc
}

const ITEMS = [{ bucket: 'tasks', fingerprint: 'f1', target_id: 't1', applied_at: '2026-10-29T00:00:00.000Z' }]

test('meet.updateAnalysisAppliedItems — PATCH /core/meet/rooms/:id/analysis/applied-items with { appliedItems }', async t => {
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ room_id: 'room-1', applied_items: ITEMS })
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.meet.updateAnalysisAppliedItems('room-1', ITEMS)
  t.equal(wsStub.callCount, 0, 'no call to the workspace-project worker (it has no such route)')
  t.equal(reqStub.callCount, 1, 'one /core request')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/meet/rooms/room-1/analysis/applied-items', 'the /core meet route (BaseService adds /core)')
  t.equal(opts.method, 'PATCH', 'PATCH')
  t.deepEqual(JSON.parse(opts.body), { appliedItems: ITEMS }, 'body { appliedItems: [...] } — the name the server reads')
  t.equal(opts.methodName, 'meet.updateAnalysisAppliedItems', 'methodName for tracking')
  sandbox.restore()
  t.end()
})

test('meet.updateAnalysisAppliedItems — the room id is URL-encoded', async t => {
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({})
  await svc.meet.updateAnalysisAppliedItems('a/b c', ITEMS)
  t.equal(reqStub.firstCall.args[0], '/meet/rooms/a%2Fb%20c/analysis/applied-items')
  sandbox.restore()
  t.end()
})

// ── dispatcher: the two caller shapes reach the wrapper as (roomId, array) ──

const makeSdk = (calls) => {
  const workspaceProject = {
    meet: {
      updateAnalysisAppliedItems: (...args) => {
        calls.push(args)
        return Promise.resolve({})
      }
    }
  }
  return { getService: (name) => (name === 'workspaceProject' ? workspaceProject : {}) }
}

test('workspaceProject.meet.analysisAppliedItems update — { roomId, payload: { applied_items } } unwraps to the array', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.meet.analysisAppliedItems', 'update', {
    roomId: 'room-1',
    payload: { applied_items: ITEMS }
  })
  t.deepEqual(calls[0], ['room-1', ITEMS], 'applySuggestion / markSuggestionApplied shape')
  t.end()
})

test('workspaceProject.meet.analysisAppliedItems update — { roomId, appliedItems } passes the array', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.meet.analysisAppliedItems', 'update', {
    roomId: 'room-1',
    appliedItems: ITEMS
  })
  t.deepEqual(calls[0], ['room-1', ITEMS], 'TranscriptPage shape')
  t.end()
})
