import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// Storage — GCS cutover complete (SDK side). storage.{createSignedUrl,remove,
// publicUrl} route unconditionally to the GCS-backed /core/storage routes via
// _request (BaseService prepends /core); storage.upload raw-fetches the /core
// base (multipart FormData can't ride _request cleanly). The legacy
// workspace-project worker `/storage/*` Supabase surface was DELETED
// server-side (server@fb183f5b), so the rollback arms are gone. Response
// shapes are un-enveloped. These tests assert the /core wire shapes without a
// live server.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._workspacePrefix = 'https://api.test/workspace-project'
  svc._apiUrl = 'https://api.test'
  return svc
}

test('storage.createSignedUrl POSTs /core/storage/<b>/signed-url, worker _ws not hit', async (t) => {
  t.plan(5)
  const svc = makeService()
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
  t.equal(wsStub.callCount, 0, '_ws (worker) never called')
  t.deepEqual(
    out,
    { signedUrl: 'https://signed', path: 'ws1/x' },
    'un-enveloped response passes through'
  )
  sandbox.restore()
  t.end()
})

test('storage.createSignedUrl defaults ttl to 300', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({})
  await svc.storage.createSignedUrl('contracts', 'ws1/x')
  t.deepEqual(
    JSON.parse(reqStub.firstCall.args[1].body),
    { path: 'ws1/x', ttl: 300 },
    'legacy MemberProfile 5-min default preserved'
  )
  sandbox.restore()
  t.end()
})

test('storage.remove DELETEs /core/storage/<b>/object, worker _ws not hit', async (t) => {
  t.plan(4)
  const svc = makeService()
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
  t.equal(wsStub.callCount, 0, '_ws never called')
  sandbox.restore()
  t.end()
})

test('storage.publicUrl POSTs /core/storage/<b>/public-url, worker _ws not hit', async (t) => {
  t.plan(4)
  const svc = makeService()
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
  t.equal(wsStub.callCount, 0, '_ws never called')
  sandbox.restore()
  t.end()
})

test('storage.upload raw-fetches the /core base upload endpoint, worker prefix not hit', async (t) => {
  t.plan(4)
  const svc = makeService()
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
    'targets the /core/storage upload base — never the worker prefix'
  )
  t.equal(
    fetchStub.firstCall.args[1].headers.Authorization,
    'Bearer tok',
    'auth header attached'
  )
  t.equal(wsStub.callCount, 0, '_ws (worker) never called')
  t.deepEqual(
    out.path,
    'ws1/123-x.png',
    'un-enveloped upload response passes through'
  )
  fetchStub.restore()
  sandbox.restore()
  t.end()
})
