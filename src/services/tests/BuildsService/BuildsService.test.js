import test from 'tape'
import sinon from 'sinon'
import { BuildsService } from '../../BuildsService.js'

// Unit coverage for the builds control-plane verbs added on top of the
// original scaffold: import update/delete, deployment rollback/scale, build
// logs, and the subscribeWorkspaceBuilds socket fan-out. Transport is mocked
// (`_call` stub / `_ioFactory` seam) — the server contract lives in
// server/src/core/builds/*; these tests pin URL construction, encoding,
// payload passthrough, and listener lifecycle.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new BuildsService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// Minimal socket.io-client stand-in — records listeners so tests can drive
// events and assert teardown. Injected via the `_ioFactory` test seam.
const makeSocketMock = () => ({
  listeners: {},
  disconnected: false,
  on (event, fn) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(fn)
  },
  fire (event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload)
  },
  removeAllListeners () { this.listeners = {} },
  disconnect () { this.disconnected = true }
})

const makeSubscribableService = () => {
  const svc = new BuildsService()
  svc._apiUrl = 'http://localhost:8080'
  svc._tokenManager = { getAccessToken: () => 'test-token' }
  const socketMock = makeSocketMock()
  let ioArgs = null
  svc._ioFactory = (url, opts) => {
    ioArgs = { url, opts }
    return socketMock
  }
  return { svc, socketMock, getIoArgs: () => ioArgs }
}

// ─── updateBuildImport ────────────────────────────────────────────────────────

test('updateBuildImport PATCHes /builds/workspaces/:wsId/imports/:repoId', async t => {
  t.plan(4)
  const svc = makeService()
  const payload = {
    envVars: { NODE_ENV: 'production' },
    defaultBranch: 'main',
    serviceRoot: 'apps/api',
    buildpackBuilder: 'gcr.io/buildpacks/builder'
  }
  const updated = { id: 'repo-1', ...payload }
  const stub = sandbox.stub(svc, '_call').resolves(updated)
  const result = await svc.updateBuildImport('ws-abc', 'repo-1', payload)
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/imports/repo-1', 'URL matches')
  t.equal(opts.method, 'PATCH', 'method is PATCH')
  t.deepEqual(opts.body, payload, 'body carries the allowlist payload verbatim')
  t.deepEqual(result, updated, 'resolves the updated import row')
  sandbox.restore()
  t.end()
})

test('updateBuildImport passes an empty payload through (server owns 400 no_updatable_fields)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.updateBuildImport('ws-abc', 'repo-1')
  const [, , opts] = stub.firstCall.args
  t.equal(opts.method, 'PATCH', 'method is PATCH')
  t.deepEqual(opts.body, {}, 'empty body reaches the server — no client-side rejection')
  sandbox.restore()
  t.end()
})

test('updateBuildImport encodes special chars in workspaceId and repoId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.updateBuildImport('ws/1', 'repo/2 x', { defaultBranch: 'main' })
  t.equal(
    stub.firstCall.args[1],
    '/builds/workspaces/ws%2F1/imports/repo%2F2%20x',
    'URI-encoded path segments'
  )
  sandbox.restore()
  t.end()
})

test('updateBuildImport throws without repoId / workspaceId', async t => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.updateBuildImport('ws-abc')
  } catch (err) {
    t.equal(err.message, 'repoId is required', 'repoId guard')
  }
  try {
    await svc.updateBuildImport(undefined, 'repo-1', {})
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'workspaceId guard (wsBase)')
  }
  sandbox.restore()
  t.end()
})

// ─── deleteBuildImport ────────────────────────────────────────────────────────

test('deleteBuildImport DELETEs /builds/workspaces/:wsId/imports/:repoId', async t => {
  t.plan(4)
  const svc = makeService()
  const response = { ok: true, repoId: 'repo-1' }
  const stub = sandbox.stub(svc, '_call').resolves(response)
  const result = await svc.deleteBuildImport('ws-abc', 'repo-1')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/imports/repo-1', 'URL matches')
  t.equal(opts.method, 'DELETE', 'method is DELETE')
  t.equal(opts.body, undefined, 'no body on DELETE')
  t.deepEqual(result, response, 'resolves { ok, repoId }')
  sandbox.restore()
  t.end()
})

test('deleteBuildImport encodes special chars in repoId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  await svc.deleteBuildImport('ws-abc', 'repo/2 x')
  t.equal(
    stub.firstCall.args[1],
    '/builds/workspaces/ws-abc/imports/repo%2F2%20x',
    'URI-encoded repoId'
  )
  sandbox.restore()
  t.end()
})

test('deleteBuildImport throws without repoId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.deleteBuildImport('ws-abc')
  } catch (err) {
    t.equal(err.message, 'repoId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── rollbackDeployment ───────────────────────────────────────────────────────

test('rollbackDeployment POSTs /builds/workspaces/:wsId/deployments/:id/rollback', async t => {
  t.plan(4)
  const svc = makeService()
  const newDeployment = { id: 'dep-NEW', status: 'running', buildId: 'b7' }
  const stub = sandbox.stub(svc, '_call').resolves(newDeployment)
  const result = await svc.rollbackDeployment('ws-abc', 'dep-3')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/deployments/dep-3/rollback', 'URL matches')
  t.equal(opts.method, 'POST', 'method is POST')
  t.equal(opts.body, undefined, 'no body — the deployment id carries the intent')
  t.deepEqual(result, newDeployment, 'resolves the NEW Deployment row (append-only history)')
  sandbox.restore()
  t.end()
})

test('rollbackDeployment encodes special chars in deploymentId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.rollbackDeployment('ws-abc', 'dep/3 x')
  t.equal(
    stub.firstCall.args[1],
    '/builds/workspaces/ws-abc/deployments/dep%2F3%20x/rollback',
    'URI-encoded deploymentId'
  )
  sandbox.restore()
  t.end()
})

test('rollbackDeployment propagates 409 build_not_deployable from server', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').rejects(new Error('build_not_deployable'))
  try {
    await svc.rollbackDeployment('ws-abc', 'dep-3')
  } catch (err) {
    t.equal(err.message, 'build_not_deployable', 'propagates server-side 409 message')
  }
  sandbox.restore()
  t.end()
})

test('rollbackDeployment throws without deploymentId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.rollbackDeployment('ws-abc')
  } catch (err) {
    t.equal(err.message, 'deploymentId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── scaleDeployment ──────────────────────────────────────────────────────────

test('scaleDeployment POSTs /builds/workspaces/:wsId/deployments/:id/scale with body', async t => {
  t.plan(4)
  const svc = makeService()
  const payload = { minInstances: 0, maxInstances: 3, cpu: '1', memory: '512Mi' }
  const updated = { id: 'dep-3', status: 'running', ...payload }
  const stub = sandbox.stub(svc, '_call').resolves(updated)
  const result = await svc.scaleDeployment('ws-abc', 'dep-3', payload)
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/deployments/dep-3/scale', 'URL matches')
  t.equal(opts.method, 'POST', 'method is POST')
  t.deepEqual(opts.body, payload, 'body carries { minInstances, maxInstances, cpu, memory }')
  t.deepEqual(result, updated, 'resolves the updated Deployment row')
  sandbox.restore()
  t.end()
})

test('scaleDeployment encodes deploymentId and defaults body to {}', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.scaleDeployment('ws-abc', 'dep/3 x')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/deployments/dep%2F3%20x/scale', 'URI-encoded')
  t.deepEqual(opts.body, {}, 'empty payload passes through as {}')
  sandbox.restore()
  t.end()
})

test('scaleDeployment propagates 409 deployment_not_scalable from server', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').rejects(new Error('deployment_not_scalable'))
  try {
    await svc.scaleDeployment('ws-abc', 'dep-3', { minInstances: 1 })
  } catch (err) {
    t.equal(err.message, 'deployment_not_scalable', 'propagates server-side 409 message')
  }
  sandbox.restore()
  t.end()
})

test('scaleDeployment throws without deploymentId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.scaleDeployment('ws-abc')
  } catch (err) {
    t.equal(err.message, 'deploymentId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── getBuildLogs ─────────────────────────────────────────────────────────────

test('getBuildLogs GETs /builds/workspaces/:wsId/builds/:id/logs', async t => {
  t.plan(3)
  const svc = makeService()
  const response = { logs: 'Step 1/4 ...', ref: 'gs://bucket/log.txt', truncated: false }
  const stub = sandbox.stub(svc, '_call').resolves(response)
  const result = await svc.getBuildLogs('ws-abc', 'b7')
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/builds/workspaces/ws-abc/builds/b7/logs', 'URL without query when no tailBytes')
  t.equal(opts, undefined, 'no options arg for GET')
  t.deepEqual(result, response, 'resolves { logs, ref, truncated }')
  sandbox.restore()
  t.end()
})

test('getBuildLogs appends ?tailBytes= and encodes ids', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ logs: '', ref: null, truncated: true })
  await svc.getBuildLogs('ws/1', 'b/7 x', { tailBytes: 65536 })
  t.equal(
    stub.firstCall.args[1],
    '/builds/workspaces/ws%2F1/builds/b%2F7%20x/logs?tailBytes=65536',
    'URI-encoded path + tailBytes query'
  )
  sandbox.restore()
  t.end()
})

test('getBuildLogs throws without buildId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.getBuildLogs('ws-abc')
  } catch (err) {
    t.equal(err.message, 'buildId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── subscribeWorkspaceBuilds ─────────────────────────────────────────────────

test('subscribeWorkspaceBuilds returns no-op without handlers / token / apiUrl', t => {
  t.plan(3)
  // No handlers at all — nothing to deliver.
  const { svc: withTransport } = makeSubscribableService()
  const unsub1 = withTransport.subscribeWorkspaceBuilds({})
  t.equal(typeof unsub1, 'function', 'no-op unsubscribe without handlers')
  unsub1()

  // No token manager — fail-soft path.
  const bare = new BuildsService()
  const unsub2 = bare.subscribeWorkspaceBuilds({ onBuildStatus: () => {} })
  t.equal(typeof unsub2, 'function', 'no-op unsubscribe without token manager')
  unsub2()

  // Token present but no apiUrl.
  const noUrl = new BuildsService()
  noUrl._tokenManager = { getAccessToken: () => 'test-token' }
  const unsub3 = noUrl.subscribeWorkspaceBuilds({ onBuildStatus: () => {} })
  t.equal(typeof unsub3, 'function', 'no-op unsubscribe without apiUrl')
  unsub3()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds opens the user socket and registers BOTH listeners', t => {
  t.plan(6)
  const { svc, socketMock, getIoArgs } = makeSubscribableService()

  const unsub = svc.subscribeWorkspaceBuilds({
    onBuildStatus: () => {},
    onDeploymentStatus: () => {}
  })

  const ioArgs = getIoArgs()
  t.equal(ioArgs.url, 'http://localhost:8080', 'socket targets the api base url')
  t.equal(ioArgs.opts.path, '/user-socket', 'same /user-socket namespace as subscribeUserEvents')
  t.equal(ioArgs.opts.auth.token, 'test-token', 'access token travels in the socket auth')
  t.equal(socketMock.listeners['build-status-changed']?.length, 1, 'build-status-changed listener registered')
  t.equal(socketMock.listeners['deployment-status-changed']?.length, 1, 'deployment-status-changed listener registered')
  t.equal(socketMock.listeners['connect_error']?.length, 1, 'connect_error listener registered')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds fans RAW payloads to the matching handler', t => {
  t.plan(4)
  const { svc, socketMock } = makeSubscribableService()

  const buildEvents = []
  const deploymentEvents = []
  const unsub = svc.subscribeWorkspaceBuilds({
    onBuildStatus: (p) => buildEvents.push(p),
    onDeploymentStatus: (p) => deploymentEvents.push(p)
  })

  const buildPayload = {
    workspaceId: 'ws-abc',
    buildId: 'b7',
    status: 'success',
    imageRef: 'europe-docker.pkg.dev/x/y:sha',
    error: null,
    repositoryFullName: 'acme/web',
    branch: 'main'
  }
  const deploymentPayload = {
    workspaceId: 'ws-abc',
    deploymentId: 'dep-3',
    status: 'running',
    url: 'https://web-xyz.a.run.app',
    error: null,
    buildId: 'b7'
  }
  socketMock.fire('build-status-changed', buildPayload)
  socketMock.fire('deployment-status-changed', deploymentPayload)

  t.equal(buildEvents.length, 1, 'onBuildStatus called once')
  t.equal(buildEvents[0], buildPayload, 'raw build payload forwarded (same reference, unshaped)')
  t.equal(deploymentEvents.length, 1, 'onDeploymentStatus called once')
  t.equal(deploymentEvents[0], deploymentPayload, 'raw deployment payload forwarded')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds workspaceId filter drops foreign events', t => {
  t.plan(4)
  const { svc, socketMock } = makeSubscribableService()

  const buildEvents = []
  const deploymentEvents = []
  const unsub = svc.subscribeWorkspaceBuilds({
    workspaceId: 'ws-abc',
    onBuildStatus: (p) => buildEvents.push(p),
    onDeploymentStatus: (p) => deploymentEvents.push(p)
  })

  // Foreign workspace — must be dropped client-side.
  socketMock.fire('build-status-changed', { workspaceId: 'ws-OTHER', buildId: 'bX', status: 'failed' })
  socketMock.fire('deployment-status-changed', { workspaceId: 'ws-OTHER', deploymentId: 'dX', status: 'failed' })
  t.equal(buildEvents.length, 0, 'foreign build event dropped')
  t.equal(deploymentEvents.length, 0, 'foreign deployment event dropped')

  // Matching workspace — delivered.
  socketMock.fire('build-status-changed', { workspaceId: 'ws-abc', buildId: 'b7', status: 'building' })
  socketMock.fire('deployment-status-changed', { workspaceId: 'ws-abc', deploymentId: 'dep-3', status: 'pending' })
  t.equal(buildEvents.length, 1, 'matching build event delivered')
  t.equal(deploymentEvents.length, 1, 'matching deployment event delivered')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds without workspaceId delivers events from every workspace', t => {
  t.plan(1)
  const { svc, socketMock } = makeSubscribableService()

  const events = []
  const unsub = svc.subscribeWorkspaceBuilds({ onBuildStatus: (p) => events.push(p) })
  socketMock.fire('build-status-changed', { workspaceId: 'ws-1', buildId: 'a', status: 'queued' })
  socketMock.fire('build-status-changed', { workspaceId: 'ws-2', buildId: 'b', status: 'queued' })
  t.equal(events.length, 2, 'no filter — both workspaces fan through')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds unsubscribe removes listeners and disconnects', t => {
  t.plan(3)
  const { svc, socketMock } = makeSubscribableService()

  const events = []
  const unsub = svc.subscribeWorkspaceBuilds({
    onBuildStatus: (p) => events.push(p),
    onDeploymentStatus: (p) => events.push(p)
  })
  unsub()

  t.deepEqual(socketMock.listeners, {}, 'all listeners removed')
  t.equal(socketMock.disconnected, true, 'socket disconnected')
  socketMock.fire('build-status-changed', { workspaceId: 'ws-abc', buildId: 'b7', status: 'success' })
  t.equal(events.length, 0, 'no delivery after unsubscribe')
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceBuilds survives a throwing handler', t => {
  t.plan(1)
  const { svc, socketMock } = makeSubscribableService()

  const received = []
  const unsub = svc.subscribeWorkspaceBuilds({
    onBuildStatus: () => { throw new Error('handler exploded') },
    onDeploymentStatus: (p) => received.push(p)
  })
  socketMock.fire('build-status-changed', { workspaceId: 'ws-abc', buildId: 'b7', status: 'success' })
  socketMock.fire('deployment-status-changed', { workspaceId: 'ws-abc', deploymentId: 'dep-3', status: 'running' })
  t.equal(received.length, 1, 'a throwing handler does not break the subscription')
  unsub()
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
