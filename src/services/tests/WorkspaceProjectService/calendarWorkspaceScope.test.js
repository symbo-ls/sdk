import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// calendar by-id calls carry workspace scope, like listEvents / createEvent /
// deleteFutureEvents already do. The worker's GET/PATCH/DELETE
// /calendar/events/:id read `?workspaceId=`; without it they act in the
// caller's STORED activeWorkspace (the last one used in any tab), so an edit
// or delete of this workspace's own event answered 200 + [] — no row — while
// the page sat in another workspace (dev, 2026-10-28: an AI Undo of an event
// it had just created "did not work").

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

// ── getEvent ──────────────────────────────────────────────────────────────

test('calendar.getEvent defaults workspaceId from _context.activeWorkspaceId', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.getEvent('ev-1')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-ctx', 'workspaceId appended from context')
  sandbox.restore()
})

test('calendar.getEvent — explicit workspaceId wins over context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.getEvent('ev-1', 'ws-explicit')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-explicit', 'explicit arg overrides context default')
  sandbox.restore()
})

test('calendar.getEvent — no workspaceId anywhere → no query string (back-compat)', async t => {
  t.plan(1)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.getEvent('ev-1')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1', 'bare endpoint, byte-identical to pre-fix behavior')
  sandbox.restore()
})

// ── updateEvent ───────────────────────────────────────────────────────────

test('calendar.updateEvent defaults workspaceId from context; the body stays { payload }', async t => {
  t.plan(3)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  const payload = { deleted: true, dirty: true }
  await svc.calendar.updateEvent('ev-1', payload)
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-ctx', 'workspaceId appended from context')
  t.equal(wsStub.firstCall.args[2].method, 'PATCH', 'still a PATCH')
  t.deepEqual(wsStub.firstCall.args[2].body, { payload }, 'workspaceId is a routing param, never folded into the body')
  sandbox.restore()
})

test('calendar.updateEvent — explicit workspaceId wins over context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.updateEvent('ev-1', { title: 'x' }, 'ws-explicit')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-explicit', 'explicit arg overrides context default')
  sandbox.restore()
})

test('calendar.updateEvent — no workspaceId anywhere → no query string (back-compat)', async t => {
  t.plan(1)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.updateEvent('ev-1', { title: 'x' })
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1', 'bare endpoint, byte-identical to pre-fix behavior')
  sandbox.restore()
})

// ── deleteEvent ───────────────────────────────────────────────────────────

test('calendar.deleteEvent defaults workspaceId from context', async t => {
  t.plan(2)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.deleteEvent('ev-1')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-ctx', 'workspaceId appended from context')
  t.equal(wsStub.firstCall.args[2].method, 'DELETE', 'still a DELETE')
  sandbox.restore()
})

test('calendar.deleteEvent — explicit workspaceId wins over context', async t => {
  t.plan(1)
  const svc = makeService('ws-ctx')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.deleteEvent('ev-1', 'ws-explicit')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1?workspaceId=ws-explicit', 'explicit arg overrides context default')
  sandbox.restore()
})

test('calendar.deleteEvent — no workspaceId anywhere → no query string (back-compat)', async t => {
  t.plan(1)
  const svc = makeService(null)
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.deleteEvent('ev-1')
  t.equal(wsStub.firstCall.args[1], '/calendar/events/ev-1', 'bare endpoint, byte-identical to pre-fix behavior')
  sandbox.restore()
})

// ── both halves of the path stay encoded ──────────────────────────────────

test('calendar by-id calls encode the id and the workspaceId', async t => {
  t.plan(3)
  const svc = makeService('ws/a b')
  const wsStub = sandbox.stub(svc, '_ws').resolves([])
  await svc.calendar.getEvent('ev/1')
  await svc.calendar.updateEvent('ev/1', {})
  await svc.calendar.deleteEvent('ev/1')
  const want = '/calendar/events/ev%2F1?workspaceId=ws%2Fa%20b'
  t.equal(wsStub.getCall(0).args[1], want, 'getEvent')
  t.equal(wsStub.getCall(1).args[1], want, 'updateEvent')
  t.equal(wsStub.getCall(2).args[1], want, 'deleteEvent')
  sandbox.restore()
})
