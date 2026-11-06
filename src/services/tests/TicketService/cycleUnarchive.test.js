import test from 'tape'
import sinon from 'sinon'
import { TicketService } from '../../TicketService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Bring back an archived cycle (CRUD sweep item 6, 2026-11-01): POST
// /core/tickets/cycle/:cycleId/unarchive. Archive had no way back, so a
// cycle archived by mistake stayed hidden from the roadmap. Like every
// other cycle route it carries ?workspaceId= (explicit, else the active
// workspace — the server answers 400 workspace_id_required without one).

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new TicketService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_readActiveWorkspaceStorage').returns(null)
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('tickets.cycle.unarchive POSTs /tickets/cycle/:id/unarchive with the workspace', async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({ _id: 'c1', status: 'planned' })
  const out = await svc.cycle.unarchive('c/1')
  await svc.cycle.unarchive('c1', { workspaceId: 'ws-2' })
  const [name, path, opts] = stub.getCall(0).args
  t.equal(name, 'tickets.cycle.unarchive', 'method name')
  t.equal(path, '/tickets/cycle/c%2F1/unarchive?workspaceId=ws-active', 'id encoded; the active workspace')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(stub.getCall(1).args[1], '/tickets/cycle/c1/unarchive?workspaceId=ws-2', 'an explicit workspace wins')
  t.deepEqual(out, { _id: 'c1', status: 'planned' }, 'the server answer passes through')
  sandbox.restore()
  t.end()
})

test("sdk.execute('tickets.cycle', 'unarchive', …) maps the cycle id and the workspace", async t => {
  const svc = makeService('ws-active')
  const stub = sandbox.stub(svc, '_call').resolves({})
  const execute = createEntityDispatcher({ getService: (name) => (name === 'tickets' ? svc : null) })
  await execute('tickets.cycle', 'unarchive', { cycleId: 'c1', workspaceId: 'ws-2' })
  await execute('tickets.cycle', 'unarchive', { id: 'c2' })
  t.deepEqual(stub.getCalls().map((c) => c.args[1]), [
    '/tickets/cycle/c1/unarchive?workspaceId=ws-2',
    '/tickets/cycle/c2/unarchive?workspaceId=ws-active'
  ])
  sandbox.restore()
  t.end()
})
