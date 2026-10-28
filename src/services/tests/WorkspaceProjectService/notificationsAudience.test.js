import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Notify by audience (server notificationAudience, 2026-10-28) — the SDK half.
//
// The server resolves a send by role / permission / team / member ref / user
// id against the workspace's own member list, closes an app's OPEN notices by
// (appId, dedupKey), and lists the members a sender may pick. The SDK must:
//   1. scope create / close / audience to the workspace the client is VIEWING
//      (`?workspaceId=`, explicit first, else _context.activeWorkspaceId) — a
//      stale token claim must never choose the audience;
//   2. keep a create with no workspace anywhere byte-identical (back-compat);
//   3. route `workspaceProject.notifications` `close` and the read-only
//      `workspaceProject.audience` entity through sdk.execute — a missing
//      route only fails at call time ("Unknown entity"), so dispatch is
//      asserted, not the map entry.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('notifications.create scopes to the active workspace and keeps the { payload } body', async (t) => {
  const svc = makeService('ws-ctx')
  const ws = sandbox.stub(svc, '_ws').resolves({ data: { sent: 2 } })
  const payload = { title: 'Overdue', toRole: 'editor' }
  await svc.notifications.create(payload)
  t.equal(ws.firstCall.args[0], 'notifications.create')
  t.equal(ws.firstCall.args[1], '/notifications?workspaceId=ws-ctx')
  t.deepEqual(ws.firstCall.args[2], { method: 'POST', body: { payload } })
  sandbox.restore()
  t.end()
})

test('notifications.create — an explicit workspaceId wins; none anywhere → the bare path', async (t) => {
  const svc = makeService('ws-ctx')
  const ws = sandbox.stub(svc, '_ws').resolves({})
  await svc.notifications.create({ title: 'x' }, { workspaceId: 'ws explicit' })
  t.equal(ws.firstCall.args[1], '/notifications?workspaceId=ws%20explicit')
  sandbox.restore()

  const bare = makeService(null)
  const ws2 = sandbox.stub(bare, '_ws').resolves({})
  await bare.notifications.create({ title: 'x' })
  t.equal(ws2.firstCall.args[1], '/notifications', 'byte-identical to the pre-audience call')
  sandbox.restore()
  t.end()
})

test('notifications.close posts { appId, dedupKey } to /notifications/close, workspace-scoped', async (t) => {
  const svc = makeService('ws-ctx')
  const ws = sandbox.stub(svc, '_ws').resolves({ data: { closed: 3 } })
  const out = await svc.notifications.close({ appId: 'system/production-app', dedupKey: 'step-1' })
  t.deepEqual(out, { data: { closed: 3 } })
  t.equal(ws.firstCall.args[0], 'notifications.close')
  t.equal(ws.firstCall.args[1], '/notifications/close?workspaceId=ws-ctx')
  t.deepEqual(ws.firstCall.args[2], {
    method: 'POST',
    body: { appId: 'system/production-app', dedupKey: 'step-1' }
  })
  sandbox.restore()
  t.end()
})

test('notifications.audience reads GET /notifications/audience, workspace-scoped', async (t) => {
  const svc = makeService('ws-ctx')
  const ws = sandbox.stub(svc, '_ws').resolves({ data: [{ ref: 'm_x', name: 'Ana' }] })
  await svc.notifications.audience()
  t.equal(ws.firstCall.args[0], 'notifications.audience')
  t.equal(ws.firstCall.args[1], '/notifications/audience?workspaceId=ws-ctx')
  t.equal(ws.firstCall.args.length, 2, 'a GET: no body')
  await svc.notifications.audience({ workspaceId: 'ws-2' })
  t.equal(ws.secondCall.args[1], '/notifications/audience?workspaceId=ws-2')
  sandbox.restore()
  t.end()
})

test('sdk.execute routes create (with an explicit workspace), close and the audience entity', async (t) => {
  const calls = []
  const sdk = {
    getService: (name) => {
      if (name !== 'workspaceProject') throw new Error(`unexpected service '${name}'`)
      return {
        notifications: {
          create: (...args) => (calls.push(['create', args]), Promise.resolve({})),
          close: (...args) => (calls.push(['close', args]), Promise.resolve({})),
          audience: (...args) => (calls.push(['audience', args]), Promise.resolve([]))
        }
      }
    }
  }
  const execute = createEntityDispatcher(sdk)
  await execute('workspaceProject.notifications', 'create', { payload: { title: 't' } })
  await execute('workspaceProject.notifications', 'create', { payload: { title: 't' }, workspaceId: 'ws-7' })
  await execute('workspaceProject.notifications', 'close', { appId: 'a/b', dedupKey: 'k' })
  await execute('workspaceProject.audience', 'list')
  await execute('workspaceProject.audience', 'list', { workspaceId: 'ws-9' })
  t.deepEqual(calls, [
    ['create', [{ title: 't' }]],
    ['create', [{ title: 't' }, { workspaceId: 'ws-7' }]],
    ['close', [{ appId: 'a/b', dedupKey: 'k' }]],
    ['audience', []],
    ['audience', [{ workspaceId: 'ws-9' }]]
  ])
  t.throws(
    () => execute('workspaceProject.audience', 'create', { title: 'x' }),
    /does not support op 'create'/,
    'the audience entity is read-only'
  )
  t.end()
})
