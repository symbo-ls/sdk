import test from 'tape'
import sinon from 'sinon'
import { TicketService } from '../../TicketService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Board columns (CRUD sweep item 6, 2026-11-01).
//
// 1. Every column call carries the tab's workspace. The column routes find
//    the org from `?workspaceId=` first (server resolveRequestOrgId →
//    readExplicitWorkspaceId, on main); the SDK sent none, so a user with
//    several tabs read and wrote the columns of the DEFAULT org, not the
//    org of the tab's workspace. An explicit workspaceId wins; else the
//    active workspace (the default every other tickets call carries).
// 2. A column can be removed: DELETE /core/tickets/columns/:key. The server
//    refuses a column that still holds tickets (409 `column_not_empty` +
//    `ticketCount`) unless `?moveTo=<columnKey>` names where they go.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new TicketService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_readActiveWorkspaceStorage').returns(null)
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('tickets.columns.list carries the active workspace; an explicit one wins', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.columns.list()
  await svc.columns.list({ workspaceId: 'ws/2' })
  t.equal(stub.getCall(0).args[0], 'tickets.columns.list', 'method name kept')
  t.equal(stub.getCall(0).args[1], '/tickets/columns?workspaceId=ws-active', 'the active workspace rides as ?workspaceId=')
  t.equal(stub.getCall(1).args[1], '/tickets/columns?workspaceId=ws%2F2', 'an explicit workspace wins (encoded)')
  sandbox.restore()
  t.end()
})

test('tickets.columns.list with no workspace anywhere sends the bare path (back-compat)', async t => {
  const svc = makeService(null)
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.columns.list()
  t.equal(stub.firstCall.args[1], '/tickets/columns', 'no query string')
  sandbox.restore()
  t.end()
})

test('tickets.columns.create and update carry the workspace; the bodies stay as they were', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.columns.create({ label: 'QA' }, { workspaceId: 'ws-2' })
  await svc.columns.update('todo', { label: 'To do' })
  const [createName, createPath, createOpts] = stub.getCall(0).args
  const [updateName, updatePath, updateOpts] = stub.getCall(1).args
  t.equal(createName, 'tickets.columns.create', 'create name kept')
  t.equal(createPath, '/tickets/columns?workspaceId=ws-2', 'create: explicit workspace')
  t.equal(createOpts.method, 'POST', 'create: POST')
  t.deepEqual(createOpts.body, { payload: { label: 'QA' } }, 'create: body unchanged ({ payload })')
  t.equal(updateName, 'tickets.columns.update', 'update name kept')
  t.equal(updatePath, '/tickets/columns/todo?workspaceId=ws-active', 'update: the active workspace')
  t.equal(updateOpts.method, 'PUT', 'update: PUT')
  t.deepEqual(updateOpts.body, { label: 'To do' }, 'update: payload forwarded directly')
  sandbox.restore()
  t.end()
})

test('tickets.columns.remove DELETEs /tickets/columns/:key with ?moveTo= and the workspace', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({ removed: 'todo', moved: 3 })
  const out = await svc.columns.remove('todo', { moveTo: 'done', workspaceId: 'ws-2' })
  await svc.columns.remove('in progress')
  const [name, path, opts] = stub.getCall(0).args
  t.equal(name, 'tickets.columns.remove', 'method name')
  t.equal(path, '/tickets/columns/todo?moveTo=done&workspaceId=ws-2', 'moveTo first, then the workspace')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.body, undefined, 'no body: moveTo rides in the query')
  t.equal(stub.getCall(1).args[1], '/tickets/columns/in%20progress?workspaceId=ws-active', 'key encoded; no moveTo when none is given')
  t.deepEqual(out, { removed: 'todo', moved: 3 }, 'the server answer passes through')
  sandbox.restore()
  t.end()
})

test('tickets.columns.remove passes the 409 column_not_empty refusal through unchanged', async t => {
  const svc = makeService('ws-active')
  const refusal = new Error('Column still has tickets')
  refusal.status = 409
  refusal.cause = { code: 'column_not_empty', ticketCount: 4 }
  sandbox.stub(svc, '_call').rejects(refusal)
  try {
    await svc.columns.remove('todo')
    t.fail('remove should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
    t.equal(err.cause.ticketCount, 4, 'the ticket count is readable for the move prompt')
  }
  sandbox.restore()
  t.end()
})

test('tickets.columns.remove needs a key', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.columns.remove('')
    t.fail('remove without a key should throw')
  } catch (err) {
    t.match(String(err.message), /key is required/, 'names the missing key')
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('tickets.columns', …) threads the workspace and reaches remove", async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({})
  const execute = createEntityDispatcher({ getService: (name) => (name === 'tickets' ? svc : null) })
  await execute('tickets.columns', 'list', {})
  await execute('tickets.columns', 'list', { workspaceId: 'ws-2' })
  await execute('tickets.columns', 'create', { payload: { label: 'QA' }, workspaceId: 'ws-2' })
  await execute('tickets.columns', 'update', { id: 'todo', payload: { label: 'To do' }, workspaceId: 'ws-2' })
  await execute('tickets.columns', 'remove', { key: 'todo', moveTo: 'done', workspaceId: 'ws-2' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1], c.args[2]?.method]), [
    ['tickets.columns.list', '/tickets/columns?workspaceId=ws-active', undefined],
    ['tickets.columns.list', '/tickets/columns?workspaceId=ws-2', undefined],
    ['tickets.columns.create', '/tickets/columns?workspaceId=ws-2', 'POST'],
    ['tickets.columns.update', '/tickets/columns/todo?workspaceId=ws-2', 'PUT'],
    ['tickets.columns.remove', '/tickets/columns/todo?moveTo=done&workspaceId=ws-2', 'DELETE']
  ])
  t.deepEqual(stub.getCall(2).args[2].body, { payload: { label: 'QA' } }, 'create body: the payload only')
  t.deepEqual(stub.getCall(3).args[2].body, { label: 'To do' }, 'update body: the workspace stays out of it')
  sandbox.restore()
  t.end()
})
