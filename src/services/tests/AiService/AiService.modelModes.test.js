import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// simone was missing from MODEL_MODES until 2026-08-08 (tickets/server.md
// "restore simone as the default AI mode") — setModelMode('simone') THREW
// even though the server's AgentModelModes enum has always accepted it as
// an explicit mode. These tests pin the fix so the gap can't silently
// regress. describeProviders() (also added here) backs the model picker's
// live per-provider diagnostics via GET /core/ai/providers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = () => {
  const svc = new AiService()
  // localStorage isn't available in the node test runner — stub it minimally
  // so getModelMode/setModelMode exercise their real try/catch paths.
  const store = {}
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] }
  }
  return svc
}

test('MODEL_MODES includes simone — setModelMode("simone") no longer throws', (t) => {
  t.plan(2)
  const svc = makeService()
  t.doesNotThrow(() => svc.setModelMode('simone'), 'accepts simone as a valid explicit mode')
  t.equal(svc.getModelMode(), 'simone', 'persists the selection')
})

test('modes() lists simone alongside every other mode, with the active flag set correctly', (t) => {
  t.plan(2)
  const svc = makeService()
  svc.setModelMode('simone')
  const modes = svc.modes()
  t.ok(
    modes.some((m) => m.key === 'simone'),
    'simone appears in the picker catalog'
  )
  t.deepEqual(
    modes.find((m) => m.key === 'simone'),
    { key: 'simone', label: 'Simone', active: true },
    'simone is flagged active once selected'
  )
})

test('setModelMode still rejects an unknown mode', (t) => {
  t.plan(1)
  const svc = makeService()
  t.throws(() => svc.setModelMode('not-a-real-provider'), /unknown modelMode/)
})

test('describeProviders() GETs /ai/providers and returns the body as-is', async (t) => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({
    defaultMode: 'auto',
    providers: [{ provider: 'simone', usable: false, reason: 'Out of credits — temporarily demoted, retrying shortly' }],
    demotedProviders: []
  })
  const result = await svc.describeProviders()
  t.equal(stub.firstCall.args[0], '/ai/providers', 'hits the real endpoint')
  t.equal(result.providers[0].provider, 'simone', 'returns the body untouched')
  sandbox.restore()
})

test('describeProviders() never throws — degrades to an empty diagnostics shape on failure', async (t) => {
  t.plan(3)
  const svc = makeService()
  sandbox.stub(svc, '_request').rejects(new Error('network down'))
  const result = await svc.describeProviders()
  t.deepEqual(result.providers, [], 'empty providers list on failure')
  t.deepEqual(result.demotedProviders, [], 'empty demoted list on failure')
  t.equal(result.defaultMode, 'auto', 'falls back to the default mode label')
  sandbox.restore()
})
