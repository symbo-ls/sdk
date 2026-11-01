import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Add to a record number in one step (CRUD sweep item 6, the loyalty points
// fix, 2026-11-01): POST /core/workspaces/:workspaceId/records/:id/increment
// { field, by }. A client that read a balance, added to it and PATCHed the
// row back lost every add made in between; the server now adds atomically.
// A spend lands only while the stored number covers it (409
// `insufficient_balance`); a key that holds no number is 409
// `field_not_numeric`. The answer is the row after the add.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('records.increment POSTs { field, by } to /workspaces/:ws/records/:id/increment', async t => {
  const svc = makeService('ws-active')
  const row = { id: 'r1', collection: 'customers', data: { points: 95 } }
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: row })
  const out = await svc.records.increment('r/1', { field: 'points', by: -5 })
  await svc.records.increment('r2', { field: 'points', by: 10 }, { workspaceId: 'ws-2' })
  const [path, opts] = stub.getCall(0).args
  t.equal(path, '/workspaces/ws-active/records/r%2F1/increment', 'the active workspace; id encoded')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.methodName, 'records.increment', 'methodName')
  t.deepEqual(JSON.parse(opts.body), { field: 'points', by: -5 }, 'body: the field and the signed amount only')
  t.equal(stub.getCall(1).args[0], '/workspaces/ws-2/records/r2/increment', 'an explicit workspace wins')
  t.deepEqual(out, row, 'the row after the add comes back')
  sandbox.restore()
  t.end()
})

test('records.increment passes the 409 insufficient_balance refusal through unchanged', async t => {
  const svc = makeService('ws-active')
  const refusal = new Error('balance too low')
  refusal.status = 409
  refusal.cause = { error: 'insufficient_balance' }
  sandbox.stub(svc, '_request').rejects(refusal)
  try {
    await svc.records.increment('r1', { field: 'points', by: -500 })
    t.fail('increment should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
    t.equal(err.cause.error, 'insufficient_balance', 'the refusal code is readable')
  }
  sandbox.restore()
  t.end()
})

test('records.increment without a workspace or an id sends nothing', async t => {
  const svc = makeService(null)
  const stub = sandbox.stub(svc, '_request').resolves({})
  try {
    await svc.records.increment('r1', { field: 'points', by: 1 })
    t.fail('no workspace should throw')
  } catch (err) {
    t.match(String(err.message), /no workspace scope/, 'names the missing workspace')
  }
  svc._context = { activeWorkspaceId: 'ws-active' }
  try {
    await svc.records.increment('', { field: 'points', by: 1 })
    t.fail('no id should throw')
  } catch (err) {
    t.match(String(err.message), /id/, 'names the missing id')
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('workspaceProject.records', 'increment', …) maps id, field, by and the workspace", async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'workspaceProject' ? svc : null) })
  await execute('workspaceProject.records', 'increment', { id: 'r1', field: 'points', by: 25, workspaceId: 'ws-2' })
  await execute('workspaceProject.records', 'increment', { id: 'r2', field: 'stamps', by: 1 })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1].method, JSON.parse(c.args[1].body)]), [
    ['/workspaces/ws-2/records/r1/increment', 'POST', { field: 'points', by: 25 }],
    ['/workspaces/ws-active/records/r2/increment', 'POST', { field: 'stamps', by: 1 }]
  ])
  sandbox.restore()
  t.end()
})
