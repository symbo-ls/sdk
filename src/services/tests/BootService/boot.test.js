import test from 'tape'
import sinon from 'sinon'
import { BootService } from '../../BootService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new BootService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── boot ─────────────────────────────────────────────────────────────────────

test('boot() GETs /boot with no query string when no workspaceId is given', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: {}, errors: {} })
  await svc.boot()
  const [methodName, path] = stub.firstCall.args
  t.equal(methodName, 'boot', 'method name matches SERVICE_METHODS.boot')
  t.equal(path, '/boot', 'no query string when workspaceId is omitted')
  sandbox.restore()
  t.end()
})

test('boot({}) behaves the same as boot() — options arg is optional', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: {}, errors: {} })
  await svc.boot({})
  t.equal(stub.firstCall.args[1], '/boot', 'still no query string')
  sandbox.restore()
  t.end()
})

test('boot({ workspaceId }) pins the explicit workspace via ?workspaceId=', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: {}, errors: {} })
  await svc.boot({ workspaceId: 'ws-abc' })
  t.equal(stub.firstCall.args[1], '/boot?workspaceId=ws-abc', 'workspaceId rides as a query param')
  sandbox.restore()
  t.end()
})

test('boot({ workspaceId }) URI-encodes special characters', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: {}, errors: {} })
  await svc.boot({ workspaceId: 'ws/foo bar' })
  t.equal(stub.firstCall.args[1], '/boot?workspaceId=ws%2Ffoo%20bar', 'URI-encoded')
  sandbox.restore()
  t.end()
})

test('boot() returns the { data, errors } payload verbatim — never reshaped', async t => {
  t.plan(1)
  const svc = makeService()
  // GET /core/boot has no `success` envelope key, so BaseService._call's
  // "bare payload" branch returns it unmodified — this pins that contract.
  const payload = {
    data: {
      me: { user: { email: 'nika@symbols.app' } },
      org: { slug: 'acme' },
      workspaces: { items: [], total: 0 },
      workspace: { displayName: 'HQ' },
      members: [],
      prefs: null,
      workspaceProject: null
    },
    errors: { workspaceProject: 'skipped: …' }
  }
  sandbox.stub(svc, '_call').resolves(payload)
  const result = await svc.boot({ workspaceId: 'ws-abc' })
  t.deepEqual(result, payload, 'sdk.boot() is a pure passthrough of the server response')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
