import test from 'tape'
import sinon from 'sinon'
import { TicketService } from '../../TicketService.js'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

const sandbox = sinon.createSandbox()

// Build a minimal TicketService with _requireReady and _call stubbed.
const makeService = () => {
  const svc = new TicketService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list ────────────────────────────────────────────────────────────────────

test('tickets.list POSTs to /tickets/list with filter + options body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ state: 'open' }, { limit: 20 })
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'tickets.list', 'method name tag')
  t.equal(path, '/tickets/list', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { filter: { state: 'open' }, options: { limit: 20 } }, 'body')
  sandbox.restore()
  t.end()
})

test('tickets.list defaults to empty filter + options', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.deepEqual(stub.firstCall.args[2].body, { filter: {}, options: {} }, 'defaults')
  sandbox.restore()
  t.end()
})

// ─── get ─────────────────────────────────────────────────────────────────────

test('tickets.get GETs /tickets/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'abc' })
  await svc.get('abc')
  t.equal(stub.firstCall.args[1], '/tickets/abc', 'path')
  t.equal(stub.firstCall.args[2], undefined, 'no options object (GET)')
  sandbox.restore()
  t.end()
})

test('tickets.get encodes special chars in id', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)
  await svc.get('foo/bar')
  t.equal(stub.firstCall.args[1], '/tickets/foo%2Fbar', 'encoded path')
  sandbox.restore()
  t.end()
})

// ─── epicCounts ───────────────────────────────────────────────────────────────

test('tickets.epicCounts GETs /tickets/epic-counts', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.epicCounts()
  t.equal(stub.firstCall.args[0], 'tickets.epicCounts', 'method name')
  t.equal(stub.firstCall.args[1], '/tickets/epic-counts', 'path')
  sandbox.restore()
  t.end()
})

// ─── agentQueue ───────────────────────────────────────────────────────────────

test('tickets.agentQueue builds assignee_email + limit query params', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.agentQueue({ assigneeEmail: 'agent@example.com', limit: 10 })
  t.equal(
    stub.firstCall.args[1],
    '/tickets/agent-queue?assignee_email=agent%40example.com&limit=10',
    'path with query params'
  )
  sandbox.restore()
  t.end()
})

test('tickets.agentQueue omits assignee_email when not provided', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.agentQueue({ limit: 5 })
  t.equal(stub.firstCall.args[1], '/tickets/agent-queue?limit=5', 'no assignee_email param')
  sandbox.restore()
  t.end()
})

// ─── create ───────────────────────────────────────────────────────────────────

test('tickets.create (JSON) POSTs to /tickets with body.payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.create({ title: 'Test ticket' })
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { payload: { title: 'Test ticket' } }, 'JSON body wrapped in payload')
  sandbox.restore()
  t.end()
})

test('tickets.create (markdown string) sends text/markdown Content-Type', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.create('# My Ticket\n\nBody here')
  const [, , opts] = stub.firstCall.args
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.body, '# My Ticket\n\nBody here', 'raw string body')
  t.equal(opts.headers['Content-Type'], 'text/markdown', 'text/markdown header')
  sandbox.restore()
  t.end()
})

// ─── update ───────────────────────────────────────────────────────────────────

test('tickets.update (JSON) PUTs to /tickets/:id with payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'x' })
  await svc.update('x', { state: 'done' })
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets/x', 'path')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(opts.body, { payload: { state: 'done' } }, 'body wrapped')
  sandbox.restore()
  t.end()
})

test('tickets.update sets If-Match header when ifMatch provided', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('x', { state: 'done' }, { ifMatch: 'etag-v1' })
  t.equal(stub.firstCall.args[2].headers['If-Match'], 'etag-v1', 'If-Match header')
  sandbox.restore()
  t.end()
})

test('tickets.update (markdown string) sends text/markdown', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('x', '# Updated\n\nBody')
  const [, , opts] = stub.firstCall.args
  t.equal(opts.headers['Content-Type'], 'text/markdown', 'text/markdown')
  t.equal(opts.body, '# Updated\n\nBody', 'raw string body')
  sandbox.restore()
  t.end()
})

// ─── remove ───────────────────────────────────────────────────────────────────

test('tickets.remove DELETEs /tickets/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)
  await svc.remove('tid-1')
  t.equal(stub.firstCall.args[1], '/tickets/tid-1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── assign ───────────────────────────────────────────────────────────────────

test('tickets.assign POSTs to /tickets/:id/assign with assigneeEmail', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.assign('tid-2', 'dev@example.com')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets/tid-2/assign', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { assigneeEmail: 'dev@example.com' }, 'body')
  sandbox.restore()
  t.end()
})

// ─── comments ─────────────────────────────────────────────────────────────────

test('tickets.comments.list GETs /tickets/:ticketId/comments', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.comments.list('tid-3')
  t.equal(stub.firstCall.args[0], 'tickets.comments.list', 'method name')
  t.equal(stub.firstCall.args[1], '/tickets/tid-3/comments', 'path')
  sandbox.restore()
  t.end()
})

test('tickets.comments.create POSTs to /tickets/:ticketId/comments', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'c1' })
  await svc.comments.create('tid-3', 'Hello comment')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets/tid-3/comments', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { body: 'Hello comment' }, 'body')
  sandbox.restore()
  t.end()
})

test('tickets.comments.update PUTs to /tickets/comments/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.comments.update('c1', 'Updated comment')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets/comments/c1', 'path')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(opts.body, { body: 'Updated comment' }, 'body')
  sandbox.restore()
  t.end()
})

test('tickets.comments.remove DELETEs /tickets/comments/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)
  await svc.comments.remove('c2')
  t.equal(stub.firstCall.args[1], '/tickets/comments/c2', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── columns ─────────────────────────────────────────────────────────────────

test('tickets.columns.list GETs /tickets/columns', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.columns.list()
  t.equal(stub.firstCall.args[0], 'tickets.columns.list', 'method name')
  t.equal(stub.firstCall.args[1], '/tickets/columns', 'path')
  sandbox.restore()
  t.end()
})

test('tickets.columns.update PUTs to /tickets/columns/:key with payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.columns.update('todo', { name: 'To Do', position: 0 })
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/tickets/columns/todo', 'path')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(opts.body, { name: 'To Do', position: 0 }, 'payload forwarded directly')
  sandbox.restore()
  t.end()
})

// ─── subscribe (SSE smoke test) ───────────────────────────────────────────────

test('tickets.subscribe calls _sseSubscribe with /tickets/stream', t => {
  t.plan(3)
  const svc = makeService()
  const filter = { ownerOrganization: 'org-1' }
  const cb = () => {}
  const unsubMock = () => {}
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(unsubMock)
  const unsub = svc.subscribe(filter, cb)
  t.equal(stub.calledOnce, true, '_sseSubscribe called once')
  t.equal(stub.firstCall.args[0], '/tickets/stream', 'path')
  t.equal(unsub, unsubMock, 'returns the unsubscribe fn from _sseSubscribe')
  sandbox.restore()
  t.end()
})

// WorkspaceProjectService back-compat aliases (get tickets / ticketColumns /
// ticketComments / ticketDependencies / realtime.subscribeTickets) were
// dropped in Phase 4 — see SDK-TICKETS-BACKCOMPAT-DROP in tickets/sdk.md.
// Callers route through sdk.tickets.* or sdk.execute('tickets', ...) now.
