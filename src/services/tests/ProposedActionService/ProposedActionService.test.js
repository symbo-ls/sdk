import test from 'tape'
import sinon from 'sinon'
import { ProposedActionService } from '../../ProposedActionService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProposedActionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list ────────────────────────────────────────────────────────────────────

test('proposedActions.list GETs /proposed-actions with filter query params', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ status: 'proposed', entityType: 'ticket', entityId: 'T1', actionKey: 'k' })
  const [name, path] = stub.firstCall.args
  t.equal(name, 'proposedActions.list', 'method name tag')
  t.ok(path.startsWith('/proposed-actions?'), 'collection path with query')
  t.ok(
    path.includes('status=proposed') &&
      path.includes('entityType=ticket') &&
      path.includes('entityId=T1') &&
      path.includes('actionKey=k'),
    'all four filters threaded'
  )
  sandbox.restore()
  t.end()
})

test('proposedActions.list with no filter GETs the bare collection', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[1], '/proposed-actions', 'no query string')
  sandbox.restore()
  t.end()
})

test('proposedActions.list threads workspaceId from filter or options', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ workspaceId: 'ws1' })
  t.ok(stub.firstCall.args[1].includes('workspaceId=ws1'), 'from filter')
  await svc.list({}, { workspaceId: 'ws2' })
  t.ok(stub.secondCall.args[1].includes('workspaceId=ws2'), 'from options')
  sandbox.restore()
  t.end()
})

// ─── get ─────────────────────────────────────────────────────────────────────

test('proposedActions.get GETs /proposed-actions/:id (encoded)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'a/b' })
  await svc.get('a/b')
  t.equal(stub.firstCall.args[1], '/proposed-actions/a%2Fb', 'encoded id path')
  t.equal(stub.firstCall.args[2], undefined, 'GET has no options')
  sandbox.restore()
  t.end()
})

// ─── propose / create ─────────────────────────────────────────────────────────

test('proposedActions.propose POSTs the payload to /proposed-actions', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'x', status: 'proposed' })
  const payload = { actionKey: 'ticket.close', entityRef: { type: 'ticket', id: 'T9' }, summary: 's' }
  await svc.propose(payload)
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/proposed-actions', 'collection path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, payload, 'payload forwarded as body')
  sandbox.restore()
  t.end()
})

test('proposedActions.create is an alias for propose', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.create({ actionKey: 'k' })
  t.equal(stub.firstCall.args[0], 'proposedActions.propose', 'routes through propose')
  sandbox.restore()
  t.end()
})

// ─── approve / reject / result — the state machine surface ────────────────────

test('proposedActions.approve POSTs /proposed-actions/:id/approve', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ status: 'approved' })
  await svc.approve('id1')
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'proposedActions.approve', 'name')
  t.equal(path, '/proposed-actions/id1/approve', 'approve sub-path')
  t.equal(opts.method, 'POST', 'POST')
  sandbox.restore()
  t.end()
})

test('proposedActions.reject POSTs /proposed-actions/:id/reject', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ status: 'rejected' })
  await svc.reject('id1')
  t.equal(stub.firstCall.args[1], '/proposed-actions/id1/reject', 'reject sub-path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  sandbox.restore()
  t.end()
})

test('proposedActions.setResult POSTs status/result to /:id/result', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ status: 'executed' })
  await svc.setResult('id1', { status: 'executed', result: { ok: true } })
  t.equal(stub.firstCall.args[1], '/proposed-actions/id1/result', 'result sub-path')
  t.deepEqual(stub.firstCall.args[2].body, { status: 'executed', result: { ok: true } }, 'body')
  sandbox.restore()
  t.end()
})

test('proposedActions decision verbs thread workspaceId as a query param', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.approve('id1', { workspaceId: 'ws7' })
  t.ok(stub.firstCall.args[1].endsWith('/approve?workspaceId=ws7'), 'workspaceId threaded')
  sandbox.restore()
  t.end()
})
