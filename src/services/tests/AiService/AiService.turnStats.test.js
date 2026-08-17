import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// tickets/ai.md AI-210 — sdk.ai.turnStats(): the reader for the server's
// per-day tool-turn telemetry (GET /core/agents/workspaces/:id/ai-turn-stats).
// Pins the request shape (route, method, `days` query only when valid), the
// workspace guard, and the pass-through of the endpoint's `rows: []` empty
// contract — a consumer must be able to distinguish "no turns yet" (empty
// ARRAY) from a missing field. Stubs `_requestExternal` exactly like the
// sibling AiService tests — no network.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = ({ workspaceId = 'ws-1', response } = {}) => {
  const svc = new AiService()
  sandbox.stub(svc, '_activeWorkspaceId').returns(workspaceId)
  const req = sandbox.stub(svc, '_requestExternal').resolves(response)
  return { svc, req }
}

test('turnStats: GETs the ai-turn-stats sibling of ai-usage for the active workspace, default window', async (t) => {
  const { svc, req } = makeService({
    response: { success: true, data: { sinceDay: '2026-08-02', days: 14, rows: [] } }
  })
  const out = await svc.turnStats()
  t.equal(req.callCount, 1)
  const [url, init] = req.firstCall.args
  t.ok(url.endsWith('/core/agents/workspaces/ws-1/ai-turn-stats'), 'route beside ai-usage')
  t.equal(init.method, 'GET')
  t.equal(init.methodName, 'ai.turnStats')
  t.deepEqual(out.rows, [], 'the empty contract passes through as an ARRAY')
  t.equal(out.days, 14)
  sandbox.resetHistory()
  t.end()
})

test('turnStats: a valid days option becomes the query; garbage is dropped (server default applies)', async (t) => {
  const { svc, req } = makeService({ response: { success: true, data: { rows: [] } } })
  await svc.turnStats({ days: 7 })
  t.ok(req.firstCall.args[0].endsWith('/ai-turn-stats?days=7'))
  await svc.turnStats({ days: 'soon' })
  t.ok(req.secondCall.args[0].endsWith('/ai-turn-stats'), 'non-numeric days → no query')
  await svc.turnStats({ days: 0 })
  t.ok(req.thirdCall.args[0].endsWith('/ai-turn-stats'), 'zero → no query (server clamps)')
  sandbox.resetHistory()
  t.end()
})

test('turnStats: an explicit workspaceId overrides the active one', async (t) => {
  const svc = new AiService()
  const active = sandbox.stub(svc, '_activeWorkspaceId').callsFake((given) => given || 'ws-active')
  const req = sandbox.stub(svc, '_requestExternal').resolves({ success: true, data: { rows: [] } })
  await svc.turnStats({ workspaceId: 'ws-other' })
  t.ok(active.calledWith('ws-other'))
  t.ok(req.firstCall.args[0].includes('/workspaces/ws-other/'))
  sandbox.resetHistory()
  t.end()
})

test('turnStats: no active workspace → throws before any request', async (t) => {
  const { svc, req } = makeService({ workspaceId: null })
  try {
    await svc.turnStats()
    t.fail('should have thrown')
  } catch (e) {
    t.match(String(e.message), /no active workspace/)
  }
  t.equal(req.callCount, 0, 'no network call without a workspace')
  sandbox.resetHistory()
  t.end()
})

test('turnStats: rows with rates pass through untouched', async (t) => {
  const rows = [
    { day: '2026-08-15', turns: 3, toolTurns: 2, okToolTurns: 1, successRate: 0.5, textLeakTurns: 1, dedupedWrites: 0 }
  ]
  const { svc } = makeService({ response: { success: true, data: { sinceDay: '2026-08-02', days: 14, rows } } })
  const out = await svc.turnStats()
  t.deepEqual(out.rows, rows)
  sandbox.resetHistory()
  t.end()
})
