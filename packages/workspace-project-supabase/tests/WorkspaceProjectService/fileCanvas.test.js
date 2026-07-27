import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// file_canvas — Mongo cutover (SDK side). /core/file-canvas/* has been
// Mongo-by-default since 2026-07-03; this namespace was the last thing keeping
// the `/sb` PostgREST passthrough alive for the table, purely because it was
// never repointed. `_sb()` must not appear on any of these paths again — that
// is the actual regression these tests lock, since a namespace quietly holding
// `/sb` open is invisible until someone greps for it.

const sandbox = sinon.createSandbox()

const makeService = (ctx) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  if (ctx) svc._context = { ...(svc._context || {}), ...ctx }
  return svc
}

test('fileCanvas.list GETs /core/file-canvas and returns the row array', async (t) => {
  t.plan(4)
  const svc = makeService()
  const rows = [{ id: 'a1', kind: 'folder', name: 'Docs', parent_id: null }]
  const reqStub = sandbox.stub(svc, '_request').resolves(rows)
  const out = await svc.fileCanvas.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/file-canvas', 'targets /core/file-canvas (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(opts.methodName, 'fileCanvas.list', 'labelled for the request log')
  t.deepEqual(out, rows, 'bare array passes through untouched')
  sandbox.restore()
  t.end()
})

test('fileCanvas.list unwraps a { data } envelope too', async (t) => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ data: [{ id: 'b2' }] })
  t.deepEqual(await svc.fileCanvas.list(), [{ id: 'b2' }], '{ data } unwrapped')
  sandbox.restore()
  t.end()
})

test('fileCanvas.list maps filter.parent_id onto ?parentId=', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves([])
  await svc.fileCanvas.list({ parent_id: 'folder-9' })
  t.equal(reqStub.firstCall.args[0], '/file-canvas?parentId=folder-9', 'parent id threaded')
  sandbox.restore()
  t.end()
})

// A null parent means "desktop root", which is a REAL filter — it must not
// degrade into an empty value the server reads as "no filter at all".
test('fileCanvas.list sends parentId=root for an explicit null parent', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves([])
  await svc.fileCanvas.list({ parent_id: null })
  t.equal(reqStub.firstCall.args[0], '/file-canvas?parentId=root', 'null → root, not empty')
  sandbox.restore()
  t.end()
})

test('fileCanvas.list threads the tab activeWorkspaceId when present', async (t) => {
  t.plan(1)
  const svc = makeService({ activeWorkspaceId: 'ws_7' })
  const reqStub = sandbox.stub(svc, '_request').resolves([])
  await svc.fileCanvas.list()
  t.equal(reqStub.firstCall.args[0], '/file-canvas?workspaceId=ws_7', 'workspace scope threaded')
  sandbox.restore()
  t.end()
})

// Unlike records, a missing workspace is NORMAL here: the route runs
// attachExplicitWorkspaceIfMember and resolves the workspace itself.
test('fileCanvas.list does not throw without a workspace in context', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves([])
  await svc.fileCanvas.list()
  t.equal(reqStub.firstCall.args[0], '/file-canvas', 'no workspaceId param, no throw')
  sandbox.restore()
  t.end()
})

test('fileCanvas.get GETs the id sub-path', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ id: 'a1', name: 'Docs' })
  const out = await svc.fileCanvas.get('a1')
  t.equal(reqStub.firstCall.args[0], '/file-canvas/a1', 'id sub-path')
  t.deepEqual(out, { id: 'a1', name: 'Docs' }, 'row returned')
  sandbox.restore()
  t.end()
})

// The payload is the body verbatim — NOT wrapped in { payload }. The /core
// route reads req.body directly (FileCanvasController.create).
test('fileCanvas.create POSTs the payload as the bare body', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ id: 'n1', kind: 'file' })
  const out = await svc.fileCanvas.create({ kind: 'file', name: 'a.txt' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/file-canvas', 'POST /core/file-canvas')
  t.deepEqual(JSON.parse(opts.body), { kind: 'file', name: 'a.txt' }, 'body is the payload itself')
  t.deepEqual(out, { id: 'n1', kind: 'file' }, 'created row returned')
  sandbox.restore()
  t.end()
})

test('fileCanvas.update PATCHes the id sub-path', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ id: 'a1', x: 10 })
  const out = await svc.fileCanvas.update('a1', { x: 10 })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/file-canvas/a1', 'id sub-path')
  t.equal(opts.method, 'PATCH', 'PATCH, matching the route verb')
  t.deepEqual(out, { id: 'a1', x: 10 }, 'updated row returned')
  sandbox.restore()
  t.end()
})

test('fileCanvas.remove DELETEs the id sub-path', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ deleted: 1, ids: ['a1'] })
  const out = await svc.fileCanvas.remove('a1')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/file-canvas/a1', 'id sub-path')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.deepEqual(out, { deleted: 1, ids: ['a1'] }, 'delete summary passes through')
  sandbox.restore()
  t.end()
})

// The SDK is a PURE passthrough for the row shape — the server
// (FileCanvasService.serializeNode) owns it. If a key-casing translation ever
// gets added here, it will diverge from the /files desktop's transform, which
// reads the snake_case column names directly.
test('fileCanvas passes the snake_case row shape through untranslated', async (t) => {
  t.plan(2)
  const svc = makeService()
  const row = {
    id: 'a1',
    workspace_id: 'ws_7',
    kind: 'file',
    name: 'a.png',
    parent_id: 'f1',
    x: 1,
    y: 2,
    file_id: 'ws_7/a.png',
    url: 'https://cdn/a.png',
    mime_type: 'image/png',
    size: 12,
    doc_id: null,
    scope: 'shared',
    created_by: 'a@x.com',
    created_at: '2026-01-02T03:04:05.000Z',
    updated_at: '2026-01-02T03:04:06.000Z'
  }
  sandbox.stub(svc, '_request').resolves([row])
  const [out] = await svc.fileCanvas.list()
  t.deepEqual(out, row, 'every column arrives byte-identical')
  t.equal(out.parentId, undefined, 'no camelCase alias is synthesized')
  sandbox.restore()
  t.end()
})

// Writes must not be rewritten either — the /core route reads the same
// snake_case keys PostgREST did (FileCanvasService.pickWritableFields).
test('fileCanvas.create sends snake_case payload keys verbatim', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({})
  const payload = {
    kind: 'file',
    name: 'a.png',
    parent_id: 'f1',
    file_id: 'ws_7/a.png',
    mime_type: 'image/png',
    doc_id: null,
    created_by: 'a@x.com'
  }
  await svc.fileCanvas.create(payload)
  t.deepEqual(JSON.parse(reqStub.firstCall.args[1].body), payload, 'keys untouched')
  sandbox.restore()
  t.end()
})

// Ids are interpolated into the path, so anything id-shaped must be escaped.
test('fileCanvas encodes ids into the path', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({})
  await svc.fileCanvas.get('a/b?c')
  t.equal(reqStub.firstCall.args[0], '/file-canvas/a%2Fb%3Fc', 'id percent-encoded')
  sandbox.restore()
  t.end()
})
