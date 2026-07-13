import test from 'tape'
import sinon from 'sinon'
import { TrackingService } from '../../TrackingService.js'

// TrackingService default transport — ships envelopes through the top-level
// Mongo-backed AnalyzedService (context.services.analyzed.ingest →
// POST /core/analyzed/ingest). The legacy workspaceProject.analyzed worker
// surface was deleted server-side (server@fb183f5b) and the SDK-side
// namespace is gone, so these tests lock the repoint: the transport must
// resolve `services.analyzed`, stamp workspace_id, and degrade gracefully
// when the service is absent.

const sandbox = sinon.createSandbox()

test('default transport ships the envelope via services.analyzed.ingest', async t => {
  t.plan(3)
  const ingest = sandbox.stub().resolves({ ok: true, ingested: 1 })
  const svc = new TrackingService({
    context: { services: { analyzed: { ingest } } }
  })
  const transport = svc._resolveTransport({ workspaceId: null, transport: null })
  const envelope = { v: 1, events: [{ id: 'e1' }] }
  const res = await transport(envelope)
  t.ok(ingest.calledOnce, 'analyzed.ingest invoked')
  t.deepEqual(ingest.firstCall.args[0], envelope, 'envelope forwarded unstamped when no workspaceId configured')
  t.deepEqual(res, { ok: true }, 'ok when ingest resolves without error')
  sandbox.restore()
  t.end()
})

test('default transport stamps workspace_id from runtimeConfig onto the envelope', async t => {
  t.plan(2)
  const ingest = sandbox.stub().resolves({})
  const svc = new TrackingService({
    context: { services: { analyzed: { ingest } } }
  })
  const transport = svc._resolveTransport({ workspaceId: 'ws-1', transport: null })
  await transport({ v: 1 })
  t.equal(ingest.firstCall.args[0].workspace_id, 'ws-1', 'workspace_id stamped')
  // A caller-set workspace_id wins over the runtimeConfig stamp.
  await transport({ v: 1, workspace_id: 'ws-caller' })
  t.equal(ingest.secondCall.args[0].workspace_id, 'ws-caller', 'existing stamp preserved')
  sandbox.restore()
  t.end()
})

test('default transport degrades to { ok: false } when the analyzed service is absent', async t => {
  t.plan(2)
  const svc = new TrackingService({ context: { services: {} } })
  const transport = svc._resolveTransport({ workspaceId: null, transport: null })
  t.deepEqual(await transport({ v: 1 }), { ok: false }, 'no analyzed service → ok:false, no throw')
  const svcNoServices = new TrackingService({ context: {} })
  const transport2 = svcNoServices._resolveTransport({ workspaceId: null, transport: null })
  t.deepEqual(await transport2({ v: 1 }), { ok: false }, 'no services bag → ok:false, no throw')
  t.end()
})

test('caller-supplied transport overrides the SDK route', async t => {
  t.plan(2)
  const ingest = sandbox.stub().resolves({})
  const custom = sandbox.stub().resolves({ ok: true })
  const svc = new TrackingService({
    context: { services: { analyzed: { ingest } } }
  })
  const transport = svc._resolveTransport({ workspaceId: 'ws-1', transport: custom })
  await transport({ v: 1 })
  t.ok(custom.calledOnce, 'custom transport invoked')
  t.equal(ingest.callCount, 0, 'analyzed.ingest bypassed')
  sandbox.restore()
  t.end()
})
