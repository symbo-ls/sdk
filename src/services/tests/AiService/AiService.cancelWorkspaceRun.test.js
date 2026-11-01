import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Cancel a running agent task of a workspace (CRUD sweep item 6,
// 2026-11-01): POST /core/agents/workspaces/:workspaceId/runs/:runId/cancel
// { note? }. The workspace owner/admin stops a run of the workspace (the
// ticket orchestration's runs) — before this a stuck run had no route, and
// it kept its agent from deletion. 409 `agent_run_finished` when the run
// already ended; 404 when the workspace holds no such run. The answer is
// the run after the cancel. Same transport as the other /core/agents
// workspace calls of this service (_requestExternal on the API base).

const sandbox = sinon.createSandbox()

const makeService = (activeWorkspaceId) => {
  const svc = new AiService()
  svc._apiUrl = 'https://api.test'
  sandbox.stub(svc, '_readActiveWorkspaceStorage').returns(null)
  svc._context = activeWorkspaceId ? { activeWorkspaceId } : {}
  return svc
}

test.onFinish(() => sandbox.restore())

test('cancelWorkspaceRun POSTs to /core/agents/workspaces/:ws/runs/:runId/cancel', async t => {
  const svc = makeService('ws-active')
  const run = { id: 'run1', status: 'cancelled' }
  const stub = sandbox.stub(svc, '_requestExternal').resolves({ success: true, data: run })
  const out = await svc.cancelWorkspaceRun('run/1', { note: 'stuck on a tool call' })
  await svc.cancelWorkspaceRun('run2', { workspaceId: 'ws 2' })
  const [url, opts] = stub.getCall(0).args
  t.equal(url, 'https://api.test/core/agents/workspaces/ws-active/runs/run%2F1/cancel', 'the active workspace; run id encoded')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.methodName, 'ai.cancelWorkspaceRun', 'methodName')
  t.deepEqual(opts.body, { note: 'stuck on a tool call' }, 'body: the note')
  t.equal(stub.getCall(1).args[0], 'https://api.test/core/agents/workspaces/ws%202/runs/run2/cancel', 'an explicit workspace wins (encoded)')
  t.deepEqual(JSON.parse(JSON.stringify(stub.getCall(1).args[1].body ?? {})), {}, 'no note: an empty body')
  t.deepEqual(out, run, 'the run after the cancel comes back')
  sandbox.restore()
  t.end()
})

test('cancelWorkspaceRun passes the 409 agent_run_finished refusal through unchanged', async t => {
  const svc = makeService('ws-active')
  const refusal = new Error('run already finished', { cause: { code: 'agent_run_finished' } })
  refusal.status = 409
  sandbox.stub(svc, '_requestExternal').rejects(refusal)
  try {
    await svc.cancelWorkspaceRun('run1')
    t.fail('cancel should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
  }
  sandbox.restore()
  t.end()
})

test('cancelWorkspaceRun needs a run id and a workspace', async t => {
  const svc = makeService(null)
  const stub = sandbox.stub(svc, '_requestExternal').resolves({})
  try {
    await svc.cancelWorkspaceRun('run1')
    t.fail('no workspace should throw')
  } catch (err) {
    t.match(String(err.message), /workspace/, 'names the missing workspace')
  }
  try {
    await svc.cancelWorkspaceRun('', { workspaceId: 'ws1' })
    t.fail('no run id should throw')
  } catch (err) {
    t.match(String(err.message), /runId/, 'names the missing run id')
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})
