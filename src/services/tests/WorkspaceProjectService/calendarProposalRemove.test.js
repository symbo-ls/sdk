import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Withdraw or decline a calendar time proposal (CRUD sweep item 6,
// 2026-11-01): DELETE /calendar/events/:id/proposals/:pid on the
// workspace-project worker — the plane the calendar app writes events on
// (`workspaceProject.calendar`). A proposal is a record ON the event (CAL-6);
// the store decides who may remove it: the proposer withdraws, whoever may
// write the event declines. Same optional ?workspaceId= as the by-id event
// routes (explicit, else the active workspace); without one the worker acts
// in the caller's stored workspace.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('calendar.removeProposal DELETEs /calendar/events/:id/proposals/:pid with the workspace', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_ws').resolves({ id: 'e1', proposals: [] })
  const out = await svc.calendar.removeProposal('e/1', 'p 1')
  await svc.calendar.removeProposal('e2', 'p2', 'ws-2')
  const [name, path, opts] = stub.getCall(0).args
  t.equal(name, 'calendar.removeProposal', 'method name')
  t.equal(path, '/calendar/events/e%2F1/proposals/p%201?workspaceId=ws-active', 'ids encoded; the active workspace')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.body, undefined, 'no body')
  t.equal(stub.getCall(1).args[1], '/calendar/events/e2/proposals/p2?workspaceId=ws-2', 'an explicit workspace wins')
  t.deepEqual(out, { id: 'e1', proposals: [] }, 'the worker answer passes through')
  sandbox.restore()
  t.end()
})

test('calendar.removeProposal with no workspace anywhere sends no query (like deleteEvent)', async t => {
  const svc = makeService(null)
  const stub = sandbox.stub(svc, '_ws').resolves({})
  await svc.calendar.removeProposal('e1', 'p1')
  t.equal(stub.firstCall.args[1], '/calendar/events/e1/proposals/p1', 'bare path')
  sandbox.restore()
  t.end()
})

test('calendar.removeProposal needs the event id and the proposal id', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_ws').resolves({})
  for (const [args, re] of [[['', 'p1'], /event/i], [['e1', ''], /proposal/i]]) {
    try {
      await svc.calendar.removeProposal(...args)
      t.fail('a missing id should throw')
    } catch (err) {
      t.match(String(err.message), re, 'names the missing id')
    }
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('workspaceProject.calendar', 'removeProposal', …) maps event, proposal and workspace", async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_ws').resolves({})
  const execute = createEntityDispatcher({ getService: (name) => (name === 'workspaceProject' ? svc : null) })
  await execute('workspaceProject.calendar', 'removeProposal', { id: 'e1', proposalId: 'p1', workspaceId: 'ws-2' })
  await execute('workspaceProject.calendar', 'removeProposal', { eventId: 'e2', proposalId: 'p2' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1], c.args[2].method]), [
    ['calendar.removeProposal', '/calendar/events/e1/proposals/p1?workspaceId=ws-2', 'DELETE'],
    ['calendar.removeProposal', '/calendar/events/e2/proposals/p2?workspaceId=ws-active', 'DELETE']
  ])
  sandbox.restore()
  t.end()
})
