import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createAnalyzing } from '../src/client.js'
import { classifyEnvelope, LOG_TYPES } from '../src/classify.js'

test('createAnalyzing requires appKey + one of sdk/endpoint/transport', () => {
  assert.throws(() => createAnalyzing({ appKey: 'x' }), /sdk, endpoint, transport/)
  assert.throws(() => createAnalyzing({ endpoint: 'https://x' }), /appKey is required/)
})

test('createAnalyzing builds a default transport from a passed sdk', async () => {
  const captured = []
  const fakeSdk = {
    execute: async (from, op, envelope) => {
      captured.push({ from, op, envelope })
      return { data: { ok: true } }
    }
  }
  const a = createAnalyzing({
    appKey: 'app',
    sdk: fakeSdk,
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.captureMessage('hello', 'info')
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(captured.length >= 1, 'sdk.execute received the envelope')
  assert.equal(captured[0].from, 'workspaceProject.analyzed')
  assert.equal(captured[0].op, 'ingest')
  assert.ok(Array.isArray(captured[0].envelope.events))
})

test('createAnalyzing produces a config + plugin + manual API', () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'workspace',
    tenantKey: 'symbols-app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } }
  })
  assert.ok(a.plugin, 'plugin exported')
  assert.ok(a.config, 'analyze config exported')
  assert.equal(a.config.capture.remote, true)
  assert.equal(a.config.capture.errors, true)
  assert.equal(a.config.capture.console, true)
  assert.equal(a.config.capture.network, true)
  assert.ok(typeof a.captureError === 'function')
  assert.ok(typeof a.captureMessage === 'function')
  assert.ok(typeof a.identify === 'function')
  assert.ok(typeof a.setContext === 'function')
  assert.ok(typeof a.addMeasurement === 'function')
  assert.ok(typeof a.sessionId === 'string')
  assert.ok(a.sessionId.length >= 8)
})

test('captureError emits with type=error level=error', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.captureError(new Error('boom'), { feature: 'x' })
  await new Promise((r) => setTimeout(r, 20))
  const env = calls.find((c) => c.events.some((e) => e.type === 'error'))
  assert.ok(env, 'envelope shipped')
  const ev = env.events.find((e) => e.type === 'error')
  assert.equal(ev.level, 'error')
  assert.equal(ev.message, 'boom')
  assert.equal(ev.log_type, 'bug')
})

test('identify stamps user onto subsequent envelopes', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.identify({ userId: 'u_42', traits: { plan: 'pro' } })
  a.captureMessage('hi', 'info')
  await new Promise((r) => setTimeout(r, 20))
  const env = calls.find((c) => c.user?.id === 'u_42')
  assert.ok(env, 'user stamped on envelope')
  assert.equal(env.traits.plan, 'pro')
})

test('identify is idempotent — same { userId, traits } emits once', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  await new Promise((r) => setTimeout(r, 20))
  const identifyEnvs = calls.filter((c) => c.events.some((e) => e.hook === 'sdk.identify'))
  const identifyEvents = identifyEnvs.flatMap((c) => c.events.filter((e) => e.hook === 'sdk.identify'))
  assert.equal(identifyEvents.length, 1, 'three same-signature identify calls produce 1 event')
})

test('identify re-emits when traits change', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  a.identify({ userId: 'u_1', traits: { plan: 'enterprise' } })
  await new Promise((r) => setTimeout(r, 20))
  const identifyEvents = calls
    .flatMap((c) => c.events.filter((e) => e.hook === 'sdk.identify'))
  assert.equal(identifyEvents.length, 2, 'changed traits trigger a new identify')
})

test('identify(null) resets dedup so next sign-in fires', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  a.identify(null)
  a.identify({ userId: 'u_1', traits: { plan: 'pro' } })
  await new Promise((r) => setTimeout(r, 20))
  const identifyEvents = calls
    .flatMap((c) => c.events.filter((e) => e.hook === 'sdk.identify'))
  assert.equal(identifyEvents.length, 2, 'sign-out clears the dedup signature')
})

test('public mode — POSTs to ingestUrl with scope fields, no auth header', async () => {
  const fetchCalls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, status: 200 }
  }
  try {
    const a = createAnalyzing({
      appKey: 'visitor-site',
      mode: 'public',
      workspaceId: 'ws_abc',
      projectId: 'symbols/my-site',
      projectEnv: 'production',
      domain: 'example.com',
      ingestUrl: 'https://mermaid.example/v1/analytics/ingest',
      level: 'trace',
      batchMs: 5,
      maxBatch: 1
    })
    a.state.activate(null)
    a.captureMessage('visit', 'info')
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(fetchCalls.length >= 1, 'fetch fired')
    const call = fetchCalls[0]
    assert.equal(call.url, 'https://mermaid.example/v1/analytics/ingest')
    assert.equal(call.init.method, 'POST')
    assert.equal(call.init.headers['Content-Type'], 'application/json')
    assert.ok(!call.init.headers.Authorization, 'no auth header in public mode')
    const body = JSON.parse(call.init.body)
    assert.equal(body.workspace_id, 'ws_abc')
    assert.equal(body.project_id, 'symbols/my-site')
    assert.equal(body.project_env, 'production')
    assert.equal(body.domain, 'example.com')
    assert.ok(Array.isArray(body.events), 'envelope events preserved')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('public mode — missing ingestUrl throws', () => {
  assert.throws(
    () => createAnalyzing({ appKey: 'x', mode: 'public', workspaceId: 'ws_1' }),
    /public mode requires ingestUrl/
  )
})

test('public mode — missing workspaceId throws', () => {
  assert.throws(
    () => createAnalyzing({ appKey: 'x', mode: 'public', ingestUrl: 'https://x/ingest' }),
    /public mode requires workspaceId/
  )
})

test('authenticated mode — public-mode opts ignored, classic transport wins', async () => {
  const fetchCalls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, status: 200 }
  }
  try {
    const captured = []
    const fakeSdk = {
      _context: { workspaceProjectTokenProvider: () => 'tok_1' },
      execute: async (from, op, envelope) => {
        captured.push({ from, op, envelope })
        return { data: { ok: true } }
      }
    }
    const a = createAnalyzing({
      appKey: 'app',
      sdk: fakeSdk,
      // ingestUrl/workspaceId set but mode is the default 'authenticated' —
      // these MUST be ignored so existing consumers don't break if they
      // accidentally pass extra opts.
      workspaceId: 'ws_should_not_apply',
      ingestUrl: 'https://should-not-fire/ingest',
      level: 'trace',
      batchMs: 5,
      maxBatch: 1
    })
    a.state.activate(null)
    a.captureMessage('hi', 'info')
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(captured.length >= 1, 'sdk.execute received the envelope')
    assert.equal(fetchCalls.length, 0, 'direct fetch to ingestUrl never fired in auth mode')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('classifyEnvelope mirrors plugin classifyEvent', () => {
  assert.deepEqual(LOG_TYPES, ['bug', 'network', 'log', 'verbose'])
  assert.equal(classifyEnvelope({ type: 'error', level: 'error' }), 'bug')
  assert.equal(classifyEnvelope({ type: 'network', level: 'info' }), 'network')
  assert.equal(classifyEnvelope({ type: 'console', level: 'warn' }), 'bug')
  assert.equal(classifyEnvelope({ type: 'state', level: 'debug' }), 'verbose')
})
