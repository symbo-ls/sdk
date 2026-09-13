import test from 'tape'
import sinon from 'sinon'
import { TrackingService } from '../../TrackingService.js'

// CORE-ANALYZED-KIND-UTC-TOTALS-ROLLUPS-1 (follow-up P3): a consumer declares
// its session FAMILY through `options.tracking.kind` (or
// `context.tracking.kind`); TrackingService forwards it to createAnalyzing,
// which stamps `envelope.kind` on every outbound envelope. Before this the
// value was silently dropped and every SDK consumer fell back to the
// server's projectId rule. Asserts the CONDITION at the factory boundary
// (what the service hands to createAnalyzing — the `createClient` test
// seam), never the absence of an error.

const fakeClient = () => ({
  state: { activate: sinon.stub() },
  setContext: sinon.stub(),
  capture: sinon.stub(),
  captureError: sinon.stub(),
  captureMessage: sinon.stub(),
  addMeasurement: sinon.stub(),
  identify: sinon.stub(),
  setTag: sinon.stub(),
  flush: sinon.stub(),
  shutdown: sinon.stub(),
  sessionId: 'sess-fake'
})

test('_buildRuntimeConfig resolves kind from options.tracking / context.tracking; invalid → null', (t) => {
  let svc = new TrackingService({ options: { tracking: { kind: 'workspace' } } })
  t.equal(svc._buildRuntimeConfig().kind, 'workspace', 'options.tracking.kind')

  svc = new TrackingService({ options: { tracking: { kind: 'project' } } })
  t.equal(svc._buildRuntimeConfig().kind, 'project', 'project via options')

  svc = new TrackingService({ context: { tracking: { kind: 'project' } } })
  t.equal(svc._buildRuntimeConfig().kind, 'project', 'context.tracking.kind')

  svc = new TrackingService({ options: { tracking: { kind: 'visitor' } } })
  t.equal(svc._buildRuntimeConfig().kind, null, 'an unknown family is ignored')

  svc = new TrackingService({})
  t.equal(svc._buildRuntimeConfig().kind, null, 'absent → null (server fallback)')
  t.end()
})

test('_setupAnalyzingClient hands kind to createAnalyzing next to the other client options', async (t) => {
  const svc = new TrackingService({ options: { tracking: { kind: 'workspace', appName: 'shell' } } })
  const createClient = sinon.stub().returns(fakeClient())
  const runtimeConfig = { ...svc._buildRuntimeConfig(), transport: async () => ({ ok: true }) }
  await svc._setupAnalyzingClient(runtimeConfig, { createClient })
  t.ok(createClient.calledOnce, 'factory invoked once')
  const opts = createClient.firstCall.args[0]
  t.equal(opts.kind, 'workspace', 'kind forwarded from tracking.kind')
  t.equal(opts.appKey, 'shell', 'the other options are untouched')
  t.equal(typeof opts.transport, 'function')
  t.equal(svc.isInitialized(), true, 'setup completed against the fake client')
  t.end()
})

test('without kind the factory receives no kind key (server fallback stays in charge)', async (t) => {
  const svc = new TrackingService({})
  const createClient = sinon.stub().returns(fakeClient())
  const runtimeConfig = { ...svc._buildRuntimeConfig(), transport: async () => ({ ok: true }) }
  await svc._setupAnalyzingClient(runtimeConfig, { createClient })
  t.equal('kind' in createClient.firstCall.args[0], false, 'no kind key')
  t.end()
})

test('an invalid tracking.kind never reaches the factory', async (t) => {
  const svc = new TrackingService({ options: { tracking: { kind: 'visitor' } } })
  const createClient = sinon.stub().returns(fakeClient())
  const runtimeConfig = { ...svc._buildRuntimeConfig(), transport: async () => ({ ok: true }) }
  await svc._setupAnalyzingClient(runtimeConfig, { createClient })
  t.equal('kind' in createClient.firstCall.args[0], false, 'ignored, not forwarded')
  t.end()
})
