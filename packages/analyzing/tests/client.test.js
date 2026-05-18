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

test('classifyEnvelope mirrors plugin classifyEvent', () => {
  assert.deepEqual(LOG_TYPES, ['bug', 'network', 'log', 'verbose'])
  assert.equal(classifyEnvelope({ type: 'error', level: 'error' }), 'bug')
  assert.equal(classifyEnvelope({ type: 'network', level: 'info' }), 'network')
  assert.equal(classifyEnvelope({ type: 'console', level: 'warn' }), 'bug')
  assert.equal(classifyEnvelope({ type: 'state', level: 'debug' }), 'verbose')
})
