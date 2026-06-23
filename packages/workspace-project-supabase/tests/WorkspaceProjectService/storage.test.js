import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// Storage DORMANT Supabase → GCS cutover (SDK side). The default path
// (_useCoreStorage() === false) MUST be byte-identical to today:
// storage.{createSignedUrl,remove,publicUrl} ride the _ws(...) workspace-project
// worker passthrough; storage.upload raw-fetches the _workspacePrefix worker
// /storage/<bucket>/upload endpoint. The on-flag path repoints the JSON methods
// to the GCS-backed /core/storage routes via _request (BaseService prepends
// /core) and repoints the multipart upload to the /core base. Response shapes
// are un-enveloped + identical in both directions. These tests assert BOTH
// directions without a live server.

const sandbox = sinon.createSandbox()

// Build a service whose _useCoreStorage() returns `flag`, with _ws + _request +
// _resolveAuthHeader stubbed so we can observe which path each method takes. The
// storage surface is a field initializer that captures `this`, so
// post-construction stubs are honored.
const makeService = (flag) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_useCoreStorage').returns(flag)
  svc._workspacePrefix = 'https://api.test/workspace-project'
  svc._apiUrl = 'https://api.test'
  return svc
}

// ── DEFAULT (dormant) path — byte-identical worker delegation ────────────────

test('storage.createSignedUrl (default OFF) hits _ws(/storage/<b>/signed-url), /core never touched', async (t) => {
  t.plan(5)
  const svc = makeService(false)
  const wsStub = sandbox
    .stub(svc, '_ws')
    .resolves({ signedUrl: 'https://signed', path: 'ws1/x' })
  const reqStub = sandbox
    .stub(svc, '_request')
    .rejects(new Error('CORE PATH MUST NOT BE HIT'))
  const out = await svc.storage.createSignedUrl('contracts', 'ws1/x', 600)
  t.ok(wsStub.calledOnce, '_ws invoked')
  t.equal(
    wsStub.firstCall.args[1],
    '/storage/contracts/signed-url',
    'worker signed-url endpoint'
  )
  t.deepEqual(
    wsStub.firstCall.args[2].body,
    { path: 'ws1/x', ttl: 600 },
    'path + ttl in body'
  )
  t.equal(
    reqStub.callCount,
    0,
    '_request (/core) never called in the default path'
  )
  t.deepEqual(
    out,
    { signedUrl: 'https://signed', path: 'ws1/x' },
    'returns the raw worker response'
  )
  sandbox.restore()
  t.end()
})

test('storage.remove (default OFF) DELETEs _ws(/storage/<b>/object), /core never touched', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const wsStub = sandbox.stub(svc, '_ws').resolves({ ok: true, path: 'ws1/x' })
  const reqStub = sandbox
    .stub(svc, '_request')
    .rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.storage.remove('workspace-files', 'ws1/x')
  t.equal(
    wsStub.firstCall.args[1],
    '/storage/workspace-files/object',
    'worker object endpoint'
  )
  t.equal(wsStub.firstCall.args[2].method, 'DELETE', 'DELETE')
  t.deepEqual(wsStub.firstCall.args[2].body, { path: 'ws1/x' }, 'path in body')
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

test('storage.publicUrl (default OFF) POSTs _ws(/storage/<b>/public-url), /core never touched', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const wsStub = sandbox
    .stub(svc, '_ws')
    .resolves({ publicUrl: 'https://pub', path: 'ws1/x' })
  const reqStub = sandbox
    .stub(svc, '_request')
    .rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.storage.publicUrl('chat-attachments', 'ws1/x')
  t.equal(
    wsStub.firstCall.args[1],
    '/storage/chat-attachments/public-url',
    'worker public-url endpoint'
  )
  t.equal(wsStub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(wsStub.firstCall.args[2].body, { path: 'ws1/x' }, 'path in body')
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

test('storage.upload (default OFF) raw-fetches the _workspacePrefix worker upload endpoint', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  const reqStub = sandbox
    .stub(svc, '_request')
    .rejects(new Error('CORE PATH MUST NOT BE HIT'))
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves({
    ok: true,
    json: async () => ({
      bucket: 'workspace-files',
      path: 'ws1/123-x.png',
      url: 'https://u'
    })
  })
  const fd = new FormData()
  const out = await svc.storage.upload('workspace-files', fd)
  t.equal(
    fetchStub.firstCall.args[0],
    'https://api.test/workspace-project/storage/workspace-files/upload',
    'targets the worker /workspace-project upload base'
  )
  t.equal(
    fetchStub.firstCall.args[1].headers.Authorization,
    'Bearer tok',
    'auth header attached'
  )
  t.equal(reqStub.callCount, 0, '/core never called')
  t.deepEqual(
    out.path,
    'ws1/123-x.png',
    'returns the un-enveloped upload response'
  )
  fetchStub.restore()
  sandbox.restore()
  t.end()
})

// ── ON-flag path — GCS /core/storage repoint ─────────────────────────────────

test('storage.createSignedUrl (flag ON) POSTs /core/storage/<b>/signed-url, _ws not hit', async (t) => {
  t.plan(5)
  const svc = makeService(true)
  const wsStub = sandbox
    .stub(svc, '_ws')
    .rejects(new Error('WORKER MUST NOT BE HIT'))
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ signedUrl: 'https://signed', path: 'ws1/x' })
  const out = await svc.storage.createSignedUrl('contracts', 'ws1/x', 600)
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(
    endpoint,
    '/storage/contracts/signed-url',
    'targets /core/storage/contracts/signed-url'
  )
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(
    JSON.parse(opts.body),
    { path: 'ws1/x', ttl: 600 },
    'path + ttl JSON-stringified'
  )
  t.equal(wsStub.callCount, 0, '_ws (worker) NOT called when flag is on')
  t.deepEqual(
    out,
    { signedUrl: 'https://signed', path: 'ws1/x' },
    'un-enveloped response passes through'
  )
  sandbox.restore()
  t.end()
})

test('storage.remove (flag ON) DELETEs /core/storage/<b>/object, _ws not hit', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  const wsStub = sandbox
    .stub(svc, '_ws')
    .rejects(new Error('WORKER MUST NOT BE HIT'))
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ ok: true, path: 'ws1/x' })
  await svc.storage.remove('workspace-files', 'ws1/x')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(
    endpoint,
    '/storage/workspace-files/object',
    'targets /core/storage/<b>/object'
  )
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.deepEqual(JSON.parse(opts.body), { path: 'ws1/x' }, 'path JSON-stringified')
  t.equal(wsStub.callCount, 0, '_ws NOT called')
  sandbox.restore()
  t.end()
})

test('storage.publicUrl (flag ON) POSTs /core/storage/<b>/public-url, _ws not hit', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  const wsStub = sandbox
    .stub(svc, '_ws')
    .rejects(new Error('WORKER MUST NOT BE HIT'))
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ publicUrl: 'https://pub', path: 'ws1/x' })
  await svc.storage.publicUrl('chat-attachments', 'ws1/x')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(
    endpoint,
    '/storage/chat-attachments/public-url',
    'targets /core/storage/<b>/public-url'
  )
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(JSON.parse(opts.body), { path: 'ws1/x' }, 'path JSON-stringified')
  t.equal(wsStub.callCount, 0, '_ws NOT called')
  sandbox.restore()
  t.end()
})

test('storage.upload (flag ON) raw-fetches the /core base upload endpoint, worker prefix not hit', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  const wsStub = sandbox
    .stub(svc, '_ws')
    .rejects(new Error('WORKER MUST NOT BE HIT'))
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves({
    ok: true,
    json: async () => ({
      bucket: 'workspace-files',
      path: 'ws1/123-x.png',
      url: 'https://u'
    })
  })
  const fd = new FormData()
  const out = await svc.storage.upload('workspace-files', fd)
  t.equal(
    fetchStub.firstCall.args[0],
    'https://api.test/core/storage/workspace-files/upload',
    'targets the /core/storage upload base'
  )
  t.equal(
    fetchStub.firstCall.args[1].headers.Authorization,
    'Bearer tok',
    'auth header attached'
  )
  t.equal(wsStub.callCount, 0, '_ws (worker) NOT called')
  t.deepEqual(
    out.path,
    'ws1/123-x.png',
    'un-enveloped upload response passes through'
  )
  fetchStub.restore()
  sandbox.restore()
  t.end()
})
