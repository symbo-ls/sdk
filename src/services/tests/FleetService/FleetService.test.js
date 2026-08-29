import test from 'tape'
import sinon from 'sinon'
import { FleetService } from '../../FleetService.js'

// CORE-FLEET-COLLECTIONS-API-1 — sdk.fleet.* wraps /core/fleet/*.

const sandbox = sinon.createSandbox()

const makeService = ({ workspace = null } = {}) => {
  const svc = new FleetService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveWorkspaceId').returns(workspace)
  return svc
}

// ─── reads ───────────────────────────────────────────────────────────────────

test('fleet.listRuns GETs /fleet/runs with the params as a query string and asks for the raw envelope', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], paging: {} })
  await svc.listRuns({ since: '2026-08-29T00:00:00Z', limit: 50, node: 'mini', empty: '' })
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'fleet.listRuns', 'method name tag')
  t.equal(path, '/fleet/runs?since=2026-08-29T00%3A00%3A00Z&limit=50&node=mini', 'query string, blanks dropped')
  t.equal(opts.raw, true, 'raw envelope so paging survives _call')
  t.equal(opts.method, undefined, 'GET')
  sandbox.restore()
  t.end()
})

test('fleet.listRuns attaches the active workspace when the caller names none', async t => {
  t.plan(2)
  const svc = makeService({ workspace: 'ws-active' })
  const stub = sandbox.stub(svc, '_call').resolves({ data: [] })
  await svc.listRuns({ lane: 'core' })
  t.equal(stub.firstCall.args[1], '/fleet/runs?lane=core&workspaceId=ws-active', 'active workspace attached')
  await svc.listRuns({ workspaceId: 'ws-explicit' })
  t.equal(stub.secondCall.args[1], '/fleet/runs?workspaceId=ws-explicit', 'an explicit workspace wins')
  sandbox.restore()
  t.end()
})

test('fleet.listRuns serialises a Date bound as ISO', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [] })
  await svc.listRuns({ until: new Date(Date.UTC(2026, 7, 30)) })
  t.equal(stub.firstCall.args[1], '/fleet/runs?until=2026-08-30T00%3A00%3A00.000Z', 'ISO')
  sandbox.restore()
  t.end()
})

test('fleet.listMetrics / listEvents hit their own paths', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [] })
  await svc.listMetrics({ kind: 'box' })
  t.equal(stub.firstCall.args[0], 'fleet.listMetrics')
  t.equal(stub.firstCall.args[1], '/fleet/metrics?kind=box')
  await svc.listEvents({ ticket: 'WS-X-1' })
  t.equal(stub.secondCall.args[0], 'fleet.listEvents')
  t.equal(stub.secondCall.args[1], '/fleet/events?ticket=WS-X-1')
  sandbox.restore()
  t.end()
})

// ─── writes ──────────────────────────────────────────────────────────────────

test('fleet.appendRuns POSTs { rows } (a single row is wrapped) with the workspace in the body', async t => {
  t.plan(5)
  const svc = makeService({ workspace: 'ws-active' })
  const stub = sandbox.stub(svc, '_call').resolves({ inserted: 1 })
  await svc.appendRuns({ node: 'mini', lane: 'core', key: 'k1' })
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'fleet.appendRuns')
  t.equal(path, '/fleet/runs')
  t.equal(opts.method, 'POST')
  t.deepEqual(opts.body, { rows: [{ node: 'mini', lane: 'core', key: 'k1' }], workspaceId: 'ws-active' }, 'body')
  t.equal(opts.raw, true, 'raw so inserted/duplicateKeys survive')
  sandbox.restore()
  t.end()
})

test('fleet.appendMetrics / appendEvents pass an array through untouched', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const rows = [{ ev: 'dispatch', t: 1, node: 'mini' }, { ev: 'box', t: 2, node: 'mini' }]
  await svc.appendMetrics(rows)
  t.equal(stub.firstCall.args[1], '/fleet/metrics')
  t.deepEqual(stub.firstCall.args[2].body, { rows }, 'no workspace when none is known')
  await svc.appendEvents([{ kind: 'orphaned', node: 'mini' }])
  t.equal(stub.secondCall.args[1], '/fleet/events')
  t.equal(stub.secondCall.args[2].method, 'POST')
  sandbox.restore()
  t.end()
})

// ─── config ──────────────────────────────────────────────────────────────────

test('fleet.listConfig / getConfig GET the config paths (unwrapped data)', async t => {
  t.plan(4)
  const svc = makeService({ workspace: 'ws-active' })
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listConfig()
  t.equal(stub.firstCall.args[1], '/fleet/config?workspaceId=ws-active')
  t.equal(stub.firstCall.args[2], undefined, 'plain GET — data is unwrapped by _call')
  await svc.getConfig('Mini/Box')
  t.equal(stub.secondCall.args[0], 'fleet.getConfig')
  t.equal(stub.secondCall.args[1], '/fleet/config/Mini%2FBox?workspaceId=ws-active', 'node is encoded')
  sandbox.restore()
  t.end()
})

test('fleet.setConfig PUTs the knobs, carrying ifVersion only when given', async t => {
  t.plan(4)
  const svc = makeService({ workspace: 'ws-active' })
  const stub = sandbox.stub(svc, '_call').resolves({ data: {}, created: true })
  await svc.setConfig('mini', { paceDial: 6, holdEpics: ['fleet'] })
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'fleet.setConfig')
  t.equal(path, '/fleet/config/mini')
  t.deepEqual(opts, {
    method: 'PUT',
    body: { paceDial: 6, holdEpics: ['fleet'], workspaceId: 'ws-active' },
    raw: true
  }, 'no ifVersion key when none was given')
  await svc.setConfig('mini', { paceDial: 5 }, { ifVersion: 3, workspaceId: 'ws-x' })
  t.deepEqual(stub.secondCall.args[2].body, { paceDial: 5, ifVersion: 3, workspaceId: 'ws-x' }, 'ifVersion + explicit workspace')
  sandbox.restore()
  t.end()
})

// ─── listAll* ────────────────────────────────────────────────────────────────

test('fleet.listAllRuns follows nextCursor to the end and reports complete', async t => {
  t.plan(4)
  const svc = makeService()
  const pages = [
    { data: [1, 2], paging: { hasMore: true, nextCursor: 'c1' } },
    { data: [3, 4], paging: { hasMore: true, nextCursor: 'c2' } },
    { data: [5], paging: { hasMore: false, nextCursor: null } }
  ]
  const stub = sandbox.stub(svc, '_call')
  pages.forEach((p, i) => stub.onCall(i).resolves(p))
  const out = await svc.listAllRuns({ node: 'mini' }, { pageSize: 2 })
  t.deepEqual(out, { items: [1, 2, 3, 4, 5], complete: true, pages: 3 })
  t.equal(stub.firstCall.args[1], '/fleet/runs?node=mini&limit=2', 'first page: no cursor')
  t.equal(stub.secondCall.args[1], '/fleet/runs?node=mini&limit=2&cursor=c1', 'second page: the cursor')
  t.equal(stub.thirdCall.args[1], '/fleet/runs?node=mini&limit=2&cursor=c2')
  sandbox.restore()
  t.end()
})

test('fleet.listAllEvents stops at maxPages and says it is incomplete', async t => {
  t.plan(3)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({ data: [1], paging: { hasMore: true, nextCursor: 'again' } })
  const out = await svc.listAllEvents({}, { maxPages: 2 })
  t.equal(out.complete, false)
  t.equal(out.pages, 2)
  t.match(out.incomplete, /2 row\(s\) in 2 page\(s\)/)
  sandbox.restore()
  t.end()
})
