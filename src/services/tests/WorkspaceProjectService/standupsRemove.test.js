import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Delete a standup (CRUD sweep item 6, 2026-11-01): DELETE
// /core/workspaces/:workspaceId/standups/:id. The standups namespace had
// list / get / create / update / upsert and no delete, so a wrong standup
// stayed for good. Same workspace scope as its siblings: an explicit
// workspaceId (options) wins, else the active workspace; with neither the
// call throws instead of sending a malformed path.

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('standups.remove DELETEs /workspaces/:ws/standups/:id', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { deleted: true } })
  const out = await svc.standups.remove('s/1')
  await svc.standups.remove('s2', { workspaceId: 'ws-2' })
  const [path, opts] = stub.getCall(0).args
  t.equal(path, '/workspaces/ws-active/standups/s%2F1', 'the active workspace; id encoded')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.methodName, 'standups.remove', 'methodName')
  t.equal(opts.body, undefined, 'no body')
  t.equal(stub.getCall(1).args[0], '/workspaces/ws-2/standups/s2', 'an explicit workspace wins')
  t.deepEqual(out, { deleted: true }, 'the envelope data comes back')
  sandbox.restore()
  t.end()
})

test('standups.remove without a workspace or an id sends nothing', async t => {
  const svc = makeService(null)
  const stub = sandbox.stub(svc, '_request').resolves({})
  try {
    await svc.standups.remove('s1')
    t.fail('no workspace should throw')
  } catch (err) {
    t.match(String(err.message), /no workspace scope/, 'names the missing workspace')
  }
  svc._context = { activeWorkspaceId: 'ws-active' }
  try {
    await svc.standups.remove('')
    t.fail('no id should throw')
  } catch (err) {
    t.match(String(err.message), /id/, 'names the missing id')
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('workspaceProject.standups', 'remove', …) maps the id and the workspace", async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  const execute = createEntityDispatcher({ getService: (name) => (name === 'workspaceProject' ? svc : null) })
  await execute('workspaceProject.standups', 'remove', { id: 's1', workspaceId: 'ws-2' })
  await execute('workspaceProject.standups', 'remove', { id: 's2' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1].method]), [
    ['/workspaces/ws-2/standups/s1', 'DELETE'],
    ['/workspaces/ws-active/standups/s2', 'DELETE']
  ])
  sandbox.restore()
  t.end()
})
