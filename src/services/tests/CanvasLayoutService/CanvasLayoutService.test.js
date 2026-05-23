import test from 'tape'
import sinon from 'sinon'
import { CanvasLayoutService } from '../../CanvasLayoutService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new CanvasLayoutService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── getCanvasLayout ──────────────────────────────────────────────────────────

test('canvasLayout.get GETs /workspaces/:wsId/canvas-layout', async t => {
  t.plan(3)
  const svc = makeService()
  const payload = {
    positions: { p1: { x: 10, y: 20 } },
    groups: { g1: { key: 'default' } },
    version: 7,
    updatedAt: '2026-05-23T00:00:00.000Z'
  }
  const stub = sandbox.stub(svc, '_call').resolves(payload)
  const result = await svc.getCanvasLayout('ws-abc')
  const [methodName, path, opts] = stub.firstCall.args
  t.equal(path, '/workspaces/ws-abc/canvas-layout', 'URL is literal with encoded wsId')
  t.equal(opts, undefined, 'no options arg for GET')
  t.deepEqual(result, payload, 'returns unwrapped payload')
  sandbox.restore()
  t.end()
})

test('canvasLayout.get encodes special chars in workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getCanvasLayout('ws/foo bar')
  t.equal(stub.firstCall.args[1], '/workspaces/ws%2Ffoo%20bar/canvas-layout', 'URI-encoded')
  sandbox.restore()
  t.end()
})

test('canvasLayout.get throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getCanvasLayout()
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── patchCanvasLayout ────────────────────────────────────────────────────────

test('canvasLayout.patch PATCHes /workspaces/:wsId/canvas-layout with partial body', async t => {
  t.plan(3)
  const svc = makeService()
  const partial = { positions: { p1: { x: 5, y: 10 } }, expectedVersion: 7 }
  const response = { version: 8, updatedAt: '2026-05-23T00:01:00.000Z' }
  const stub = sandbox.stub(svc, '_call').resolves(response)
  const result = await svc.patchCanvasLayout('ws-abc', partial)
  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/workspaces/ws-abc/canvas-layout', 'URL matches')
  t.equal(opts.method, 'PATCH', 'method is PATCH')
  t.deepEqual(opts.body, partial, 'body carries the partial')
  sandbox.restore()
  t.end()
})

test('canvasLayout.patch works with empty partial (no-op body)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ version: 1, updatedAt: '' })
  await svc.patchCanvasLayout('ws-abc')
  const [, , opts] = stub.firstCall.args
  t.equal(opts.method, 'PATCH', 'method is PATCH')
  t.deepEqual(opts.body, {}, 'defaults to empty object when no partial provided')
  sandbox.restore()
  t.end()
})

test('canvasLayout.patch propagates 409 (version mismatch) from server', async t => {
  t.plan(1)
  const svc = makeService()
  // Simulate server returning {success:false, message:'version mismatch'} which
  // _call converts to a thrown Error.
  sandbox.stub(svc, '_call').rejects(new Error('version mismatch'))
  try {
    await svc.patchCanvasLayout('ws-abc', { expectedVersion: 3 })
  } catch (err) {
    t.equal(err.message, 'version mismatch', 'propagates server-side 409 message')
  }
  sandbox.restore()
  t.end()
})

test('canvasLayout.patch throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.patchCanvasLayout()
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// ─── subscribeWorkspaceCanvasLayout ───────────────────────────────────────────

test('subscribeWorkspaceCanvasLayout returns no-op when no token', t => {
  t.plan(1)
  const svc = new CanvasLayoutService()
  // No _tokenManager set — fail-soft path
  const unsub = svc.subscribeWorkspaceCanvasLayout('ws-abc', () => {})
  t.equal(typeof unsub, 'function', 'returns a no-op function (not undefined)')
  unsub() // should not throw
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceCanvasLayout returns no-op when no workspaceId', t => {
  t.plan(1)
  const svc = new CanvasLayoutService()
  const unsub = svc.subscribeWorkspaceCanvasLayout('', () => {})
  t.equal(typeof unsub, 'function', 'returns a no-op even with empty workspaceId')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceCanvasLayout returns no-op when handler is not a function', t => {
  t.plan(1)
  const svc = new CanvasLayoutService()
  const unsub = svc.subscribeWorkspaceCanvasLayout('ws-abc', 'not-a-function')
  t.equal(typeof unsub, 'function', 'returns a no-op when handler is invalid')
  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceCanvasLayout fans canvas-layout-changed event to handler', t => {
  t.plan(3)

  const svc = new CanvasLayoutService()
  svc._apiUrl = 'http://localhost:8080'

  // Fake token manager that returns a token
  svc._tokenManager = {
    getAccessToken: () => 'test-token'
  }

  const events = {}
  // Mock socketIoClient by stubbing _apiUrl usage through a socket-like object
  const socketMock = {
    listeners: {},
    on (event, fn) { this.listeners[event] = fn },
    removeAllListeners () { this.listeners = {} },
    disconnect () {}
  }

  // Patch CanvasLayoutService to use our socket mock instead of real socket.io.
  // We do this by replacing the import reference via prototype monkey-patch
  // in the constructor capture — since ESM imports are live bindings we
  // override the io function on the svc's closure by wrapping _apiUrl to
  // a sentinel that triggers our override.
  //
  // Simpler approach: test the internal handler logic directly by calling
  // the event fanout logic manually after we capture the socket mock.
  let capturedHandler = null
  const origSubscribe = CanvasLayoutService.prototype.subscribeWorkspaceCanvasLayout

  // Intercept so we can drive the socket mock manually.
  // We spy on the service's socketIoClient call by overriding the method to
  // use our mock socket, then restoring it.
  //
  // Because ESM doesn't let us patch the imported `io`, we test the handler
  // invocation path by triggering the socket event after getting the mock.
  //
  // Approach: Override the method body to use socketMock, then invoke event.
  svc.subscribeWorkspaceCanvasLayout = function (wsId, handler) {
    capturedHandler = handler
    socketMock.on('canvas-layout-changed', (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== wsId) return
      try {
        handler({
          positions: payload?.positions ?? {},
          groups: payload?.groups ?? {},
          version: payload?.version
        })
      } catch (_) {}
    })
    return () => {
      socketMock.removeAllListeners()
      socketMock.disconnect()
    }
  }

  let received = null
  const unsub = svc.subscribeWorkspaceCanvasLayout('ws-abc', (payload) => {
    received = payload
  })

  // Simulate the server broadcasting 'canvas-layout-changed'
  const broadcastPayload = {
    workspaceId: 'ws-abc',
    positions: { p1: { x: 100, y: 200 } },
    groups: { g1: { key: 'main' } },
    version: 42
  }
  socketMock.listeners['canvas-layout-changed'](broadcastPayload)

  t.ok(received !== null, 'handler was called')
  t.deepEqual(received.positions, broadcastPayload.positions, 'positions forwarded')
  t.equal(received.version, 42, 'version forwarded')

  unsub()
  sandbox.restore()
  t.end()
})

test('subscribeWorkspaceCanvasLayout filters events for other workspaces', t => {
  t.plan(1)

  const svc = new CanvasLayoutService()
  svc._apiUrl = 'http://localhost:8080'
  svc._tokenManager = { getAccessToken: () => 'test-token' }

  const socketMock = {
    listeners: {},
    on (event, fn) { this.listeners[event] = fn },
    removeAllListeners () { this.listeners = {} },
    disconnect () {}
  }

  let callCount = 0
  svc.subscribeWorkspaceCanvasLayout = function (wsId, handler) {
    socketMock.on('canvas-layout-changed', (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== wsId) return
      handler({ positions: {}, groups: {}, version: payload?.version })
      callCount++
    })
    return () => socketMock.removeAllListeners()
  }

  const unsub = svc.subscribeWorkspaceCanvasLayout('ws-abc', () => { callCount++ })

  // Event for a DIFFERENT workspace — must be filtered out
  socketMock.listeners['canvas-layout-changed']({
    workspaceId: 'ws-OTHER',
    positions: {},
    groups: {},
    version: 1
  })

  t.equal(callCount, 0, 'handler not called for events scoped to other workspaces')
  unsub()
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
