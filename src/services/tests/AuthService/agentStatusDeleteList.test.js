import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Agents (CRUD sweep item 6, 2026-11-01):
//   setAgentStatus — PATCH /core/users/agents/:agentId/status { status }:
//     deactivate / reactivate. An inactive agent starts no run; the
//     deactivation cancels its QUEUED runs. The allowed values are the
//     server's (400 with the list otherwise) — the SDK does not copy them.
//   deleteAgent — DELETE /core/users/agents/:agentId; 409
//     `agent_has_active_runs` while a run is under way.
//   listAgents(orgId, { includeDeletedSeeds: true }) — GET
//     /core/users/agents?orgId=&includeDeletedSeeds=1: the deleted default
//     agents come back as rows, so the canvas can show Restore on each
//     (Restore = createAgent({ seedSlug })).
// The two new writes use _call: a refusal reaches the caller as the HTTP
// error itself (status + the server body as `cause`), not re-wrapped.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

const httpError = (status, body) => {
  const err = new Error(body.message || 'Request failed', { cause: body })
  err.status = status
  return err
}

test.onFinish(() => sandbox.restore())

test('setAgentStatus PATCHes /users/agents/:id/status with { status }', async t => {
  const svc = makeService()
  const data = { agent: { id: 'a1', status: 'inactive' }, runs: { cancelled: 2, started: 0 } }
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data })
  const out = await svc.setAgentStatus('a/1', 'inactive')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/users/agents/a%2F1/status', 'id encoded')
  t.equal(opts.method, 'PATCH', 'PATCH')
  t.equal(opts.methodName, 'setAgentStatus', 'methodName')
  t.deepEqual(JSON.parse(opts.body), { status: 'inactive' }, 'body: the status only')
  t.deepEqual(out, data, 'the envelope data comes back')
  sandbox.restore()
  t.end()
})

test('deleteAgent DELETEs /users/agents/:id', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { deleted: true } })
  const out = await svc.deleteAgent('a1')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/users/agents/a1', 'path')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.methodName, 'deleteAgent', 'methodName')
  t.equal(opts.body, undefined, 'no body')
  t.deepEqual(out, { deleted: true }, 'the envelope data comes back')
  sandbox.restore()
  t.end()
})

test('deleteAgent passes the 409 agent_has_active_runs refusal through unchanged', async t => {
  const svc = makeService()
  const refusal = httpError(409, { error: 'agent_has_active_runs', code: 'agent_has_active_runs', message: 'runs under way' })
  sandbox.stub(svc, '_request').rejects(refusal)
  try {
    await svc.deleteAgent('a1')
    t.fail('deleteAgent should reject')
  } catch (err) {
    t.equal(err.status, 409, 'the HTTP status is on the error itself')
    t.equal(err.cause && err.cause.code, 'agent_has_active_runs', 'the refusal code is on err.cause')
  }
  sandbox.restore()
  t.end()
})

test('setAgentStatus and deleteAgent need an agent id (and a status)', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  const cases = [
    [() => svc.setAgentStatus('', 'inactive'), /agentId/],
    [() => svc.setAgentStatus('a1', ''), /status/],
    [() => svc.deleteAgent(''), /agentId/]
  ]
  for (const [run, re] of cases) {
    try {
      await run()
      t.fail('a missing argument should throw')
    } catch (err) {
      t.match(String(err.message), re, 'names the missing argument')
    }
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test('listAgents adds includeDeletedSeeds=1 only when asked; the old call is byte-identical', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.listAgents('org1', { includeDeletedSeeds: true })
  await svc.listAgents('org1')
  await svc.listAgents('org1', { includeDeletedSeeds: false })
  t.deepEqual(stub.getCalls().map((c) => c.args[0]), [
    '/users/agents?orgId=org1&includeDeletedSeeds=1',
    '/users/agents?orgId=org1',
    '/users/agents?orgId=org1'
  ])
  sandbox.restore()
  t.end()
})

test('SERVICE_METHODS exposes setAgentStatus and deleteAgent at the top level (auth)', t => {
  t.equal(SERVICE_METHODS.setAgentStatus, 'auth', 'sdk.setAgentStatus')
  t.equal(SERVICE_METHODS.deleteAgent, 'auth', 'sdk.deleteAgent')
  t.end()
})
