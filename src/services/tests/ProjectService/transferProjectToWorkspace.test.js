import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

test('transferProjectToWorkspace POSTs to /projects/:id/transfer-workspace', async t => {
  t.plan(4)
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { ok: true } })
  const res = await svc.transferProjectToWorkspace('proj-1', 'ws-2')
  t.deepEqual(res, { ok: true })
  t.equal(stub.firstCall.args[0], '/projects/proj-1/transfer-workspace')
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { targetWorkspaceId: 'ws-2' })
  sandbox.restore()
  t.end()
})

test('transferProjectToWorkspace throws without projectId', async t => {
  t.plan(1)
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  try {
    await svc.transferProjectToWorkspace(undefined, 'ws-2')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Project ID is required')
  }
  sandbox.restore()
  t.end()
})

test('transferProjectToWorkspace throws without targetWorkspaceId', async t => {
  t.plan(1)
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  try {
    await svc.transferProjectToWorkspace('proj-1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'targetWorkspaceId is required')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
