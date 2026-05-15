import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('analyzed.ingest POSTs envelope to /analyzed/ingest', async t => {
  t.plan(4)
  const svc = makeService()
  const wsStub = sandbox.stub(svc, '_ws').resolves({ data: { ok: true, ingested: 3 } })
  const envelope = {
    v: 1,
    session: { id: 's-1', sentAt: Date.now() },
    app: { key: 'workspace', release: 'v1', env: 'next' },
    events: [
      { id: 'e1', ts: Date.now(), type: 'error', level: 'error', message: 'boom' },
    ],
  }
  await svc.analyzed.ingest(envelope)
  const [methodName, endpoint, opts] = wsStub.firstCall.args
  t.equal(methodName, 'analyzed.ingest', 'methodName tag')
  t.equal(endpoint, '/analyzed/ingest', 'curated route')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.body, envelope, 'envelope passed as body (server stamps workspace_id)')
  sandbox.restore()
  t.end()
})

test('analyzed.listSessions GETs analyzed_session_summaries with workspace_id filter', async t => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_requestExternal').resolves({ data: [] })
  svc._workspacePrefix = 'https://api/workspace-project'
  await svc.analyzed.listSessions({ workspace_id: '11111111-1111-1111-1111-111111111111' }, { limit: 50 })
  const [url, init] = reqStub.firstCall.args
  t.ok(url.includes('/sb/rest/v1/analyzed_session_summaries'), 'hits the summaries view')
  t.ok(url.includes('workspace_id=eq.11111111-1111-1111-1111-111111111111'), 'workspace filter encoded')
  t.ok(url.includes('order=started_at.desc'), 'default order applied')
  t.equal(init.method, 'GET', 'GET')
  sandbox.restore()
  t.end()
})

test('analyzed.listEvents includes session_id + log_type filters', async t => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_requestExternal').resolves({ data: [] })
  svc._workspacePrefix = 'https://api/workspace-project'
  await svc.analyzed.listEvents(
    {
      workspace_id: '11111111-1111-1111-1111-111111111111',
      session_id: 's-1',
      log_type: 'bug',
    },
    { limit: 200 }
  )
  const url = reqStub.firstCall.args[0]
  t.ok(url.includes('session_id=eq.s-1'), 'session id filter')
  t.ok(url.includes('log_type=eq.bug'), 'log type filter')
  t.ok(url.includes('limit=200'), 'limit applied')
  sandbox.restore()
  t.end()
})

test('analyzed.clusters POSTs to fn_analyzed_bug_clusters RPC with workspace_id', async t => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_requestExternal').resolves({ data: [] })
  svc._workspacePrefix = 'https://api/workspace-project'
  await svc.analyzed.clusters({
    workspaceId: '11111111-1111-1111-1111-111111111111',
    appKey: 'workspace',
    since: '2026-05-01',
    limit: 50,
  })
  const [url, init] = reqStub.firstCall.args
  t.ok(url.includes('/sb/rest/v1/rpc/fn_analyzed_bug_clusters'), 'hits the RPC')
  t.equal(init.method, 'POST', 'POST')
  t.deepEqual(JSON.parse(init.body), {
    p_workspace: '11111111-1111-1111-1111-111111111111',
    p_app_key:   'workspace',
    p_since:     '2026-05-01',
    p_max_rows:  50
  }, 'named args mapped to p_<name>')
  sandbox.restore()
  t.end()
})
