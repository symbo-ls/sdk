import test from 'tape'
import sinon from 'sinon'
import { DocService } from '../../DocService.js'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

const sandbox = sinon.createSandbox()

// Build a minimal DocService with _requireReady and _call stubbed.
const makeService = () => {
  const svc = new DocService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list ─────────────────────────────────────────────────────────────────────

test('docs.list POSTs to /docs/list with filter + options body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.list({ type: 'document' }, { limit: 20 })
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'docs.list', 'method name tag')
  t.equal(path, '/docs/list', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { filter: { type: 'document' }, options: { limit: 20 } }, 'body')
  sandbox.restore()
  t.end()
})

test('docs.list defaults to empty filter + options', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.list()
  t.deepEqual(stub.firstCall.args[2].body, { filter: {}, options: {} }, 'defaults')
  sandbox.restore()
  t.end()
})

// ─── get ──────────────────────────────────────────────────────────────────────

test('docs.get GETs /docs/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'abc' })
  await svc.get('abc')
  t.equal(stub.firstCall.args[1], '/docs/abc', 'path')
  t.equal(stub.firstCall.args[2], undefined, 'no options object (GET)')
  sandbox.restore()
  t.end()
})

test('docs.get encodes special chars in id', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)
  await svc.get('foo/bar')
  t.equal(stub.firstCall.args[1], '/docs/foo%2Fbar', 'encoded path')
  sandbox.restore()
  t.end()
})

// ─── tree ─────────────────────────────────────────────────────────────────────

test('docs.tree GETs /docs/:id/tree', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ root: {}, descendants: [] })
  await svc.tree('doc-1')
  t.equal(stub.firstCall.args[0], 'docs.tree', 'method name')
  t.equal(stub.firstCall.args[1], '/docs/doc-1/tree', 'path')
  sandbox.restore()
  t.end()
})

// ─── folders ──────────────────────────────────────────────────────────────────

test('docs.folders GETs /docs/folders', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.folders()
  t.equal(stub.firstCall.args[0], 'docs.folders', 'method name')
  t.equal(stub.firstCall.args[1], '/docs/folders', 'path')
  sandbox.restore()
  t.end()
})

// ─── create ───────────────────────────────────────────────────────────────────

test('docs.create (JSON) POSTs to /docs with body.payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.create({ title: 'My Doc', type: 'document' })
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/docs', 'path')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(opts.body, { payload: { title: 'My Doc', type: 'document' } }, 'JSON body wrapped in payload')
  sandbox.restore()
  t.end()
})

test('docs.create (markdown string) sends text/markdown Content-Type', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.create('# My Doc\n\nBody here')
  const [, , opts] = stub.firstCall.args
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.body, '# My Doc\n\nBody here', 'raw string body')
  t.equal(opts.headers['Content-Type'], 'text/markdown', 'text/markdown header')
  sandbox.restore()
  t.end()
})

// ─── update ───────────────────────────────────────────────────────────────────

test('docs.update (JSON) PUTs to /docs/:id with payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'x' })
  await svc.update('x', { title: 'Updated' })
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/docs/x', 'path')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(opts.body, { payload: { title: 'Updated' } }, 'body wrapped')
  sandbox.restore()
  t.end()
})

test('docs.update sets If-Match header when ifMatch provided', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('x', { title: 'Updated' }, { ifMatch: 'hash-v1' })
  t.equal(stub.firstCall.args[2].headers['If-Match'], 'hash-v1', 'If-Match header')
  sandbox.restore()
  t.end()
})

test('docs.update (markdown string) sends text/markdown', async t => {
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

test('docs.update without ifMatch has empty headers object', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('x', { title: 'X' })
  t.deepEqual(stub.firstCall.args[2].headers, {}, 'empty headers when no ifMatch')
  sandbox.restore()
  t.end()
})

// ─── remove ───────────────────────────────────────────────────────────────────

test('docs.remove DELETEs /docs/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)
  await svc.remove('doc-1')
  t.equal(stub.firstCall.args[1], '/docs/doc-1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── subscribe (SSE smoke test) ───────────────────────────────────────────────

test('docs.subscribe calls _sseSubscribe with /docs/stream', t => {
  t.plan(3)
  const svc = makeService()
  const filter = { ownerOrganization: 'org-1' }
  const cb = () => {}
  const unsubMock = () => {}
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(unsubMock)
  const unsub = svc.subscribe(filter, cb)
  t.equal(stub.calledOnce, true, '_sseSubscribe called once')
  t.equal(stub.firstCall.args[0], '/docs/stream', 'path')
  t.equal(unsub, unsubMock, 'returns the unsubscribe fn from _sseSubscribe')
  sandbox.restore()
  t.end()
})

// ─── documents sub-namespace ──────────────────────────────────────────────────

test('docs.documents.list calls list with type=document', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.documents.list({ limit: 5 })
  t.deepEqual(stub.firstCall.args[2].body.filter, { type: 'document' }, 'type filter')
  sandbox.restore()
  t.end()
})

test('docs.documents.create merges type=document into payload', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.documents.create({ title: 'Doc' })
  t.deepEqual(stub.firstCall.args[2].body, { payload: { title: 'Doc', type: 'document' } }, 'type merged')
  sandbox.restore()
  t.end()
})

test('docs.documents.get delegates to docs.get', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'doc-1' })
  await svc.documents.get('doc-1')
  t.equal(stub.firstCall.args[1], '/docs/doc-1', 'path')
  sandbox.restore()
  t.end()
})

test('docs.documents.update delegates to docs.update', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.documents.update('doc-1', { title: 'New' })
  t.equal(stub.firstCall.args[1], '/docs/doc-1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PUT', 'PUT')
  sandbox.restore()
  t.end()
})

// ─── kbArticles sub-namespace ─────────────────────────────────────────────────

test('docs.kbArticles.list calls list with type=kb_article', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.kbArticles.list()
  t.deepEqual(stub.firstCall.args[2].body.filter, { type: 'kb_article' }, 'type filter')
  sandbox.restore()
  t.end()
})

test('docs.kbArticles.create merges type=kb_article into payload', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.kbArticles.create({ title: 'KB Article', category: 'howto' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { title: 'KB Article', category: 'howto', type: 'kb_article' } },
    'type merged'
  )
  sandbox.restore()
  t.end()
})

test('docs.kbArticles.children lists by refs.parent', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.kbArticles.children('parent-doc-id')
  t.deepEqual(stub.firstCall.args[2].body.filter, { 'refs.parent': 'parent-doc-id' }, 'filter by parent ref')
  sandbox.restore()
  t.end()
})

// ─── notes sub-namespace ──────────────────────────────────────────────────────

test('docs.notes.list calls list with type=note', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.notes.list()
  t.deepEqual(stub.firstCall.args[2].body.filter, { type: 'note' }, 'type filter')
  sandbox.restore()
  t.end()
})

test('docs.notes.create merges type=note into payload', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.notes.create({ title: 'My Note', color: 'yellow' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { title: 'My Note', color: 'yellow', type: 'note' } },
    'type merged'
  )
  sandbox.restore()
  t.end()
})

// ─── userDocs sub-namespace ───────────────────────────────────────────────────

test('docs.userDocs.list calls list with type=user_document', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [], count: 0 })
  await svc.userDocs.list()
  t.deepEqual(stub.firstCall.args[2].body.filter, { type: 'user_document' }, 'type filter')
  sandbox.restore()
  t.end()
})

test('docs.userDocs.create merges type=user_document into payload', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.userDocs.create({ title: 'Private Doc', privacy: 'private' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { title: 'Private Doc', privacy: 'private', type: 'user_document' } },
    'type merged'
  )
  sandbox.restore()
  t.end()
})

// ─── WorkspaceProjectService back-compat alias ───────────────────────────────

test('workspaceProject.documents getter delegates list to sdk.docs.list', async t => {
  t.plan(1)
  // Build a real WPS with a fake docs service injected via context.services
  const wps = new WorkspaceProjectService()
  const fakeDocs = {
    list: sinon.stub().resolves({ data: [], count: 0 }),
    get: sinon.stub(),
    create: sinon.stub(),
    update: sinon.stub(),
    remove: sinon.stub(),
    kbArticles: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() },
    notes: { list: sinon.stub(), create: sinon.stub() },
    userDocs: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() }
  }
  wps._context = { services: { docs: fakeDocs } }

  await wps.documents.list()
  t.ok(fakeDocs.list.calledOnce, 'docs.list called once')
  t.end()
})

test('workspaceProject.documents getter delegates listKb to sdk.docs.kbArticles.list', async t => {
  t.plan(1)
  const wps = new WorkspaceProjectService()
  const fakeDocs = {
    list: sinon.stub(),
    kbArticles: { list: sinon.stub().resolves([]), create: sinon.stub(), update: sinon.stub() },
    notes: { list: sinon.stub(), create: sinon.stub() },
    userDocs: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() }
  }
  wps._context = { services: { docs: fakeDocs } }

  await wps.documents.listKb()
  t.ok(fakeDocs.kbArticles.list.calledOnce, 'kbArticles.list called once')
  t.end()
})

test('workspaceProject.documents getter delegates listNotes to sdk.docs.notes.list', async t => {
  t.plan(1)
  const wps = new WorkspaceProjectService()
  const fakeDocs = {
    list: sinon.stub(),
    kbArticles: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() },
    notes: { list: sinon.stub().resolves([]), create: sinon.stub() },
    userDocs: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() }
  }
  wps._context = { services: { docs: fakeDocs } }

  await wps.documents.listNotes()
  t.ok(fakeDocs.notes.list.calledOnce, 'notes.list called once')
  t.end()
})

test('workspaceProject.documents resource-links methods throw with migration error', t => {
  t.plan(5)
  const wps = new WorkspaceProjectService()
  const fakeDocs = {
    list: sinon.stub(),
    kbArticles: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() },
    notes: { list: sinon.stub(), create: sinon.stub() },
    userDocs: { list: sinon.stub(), create: sinon.stub(), update: sinon.stub() }
  }
  wps._context = { services: { docs: fakeDocs } }

  t.throws(() => wps.documents.listResourceLinks(), /resource-links not migrated/, 'listResourceLinks throws')
  t.throws(() => wps.documents.addResourceLink(), /resource-links not migrated/, 'addResourceLink throws')
  t.throws(() => wps.documents.updateResourceLink(), /resource-links not migrated/, 'updateResourceLink throws')
  t.throws(() => wps.documents.removeResourceLink(), /resource-links not migrated/, 'removeResourceLink throws')
  t.throws(() => wps.documents.removeResourceLinkByPair(), /resource-links not migrated/, 'removeResourceLinkByPair throws')
  t.end()
})
