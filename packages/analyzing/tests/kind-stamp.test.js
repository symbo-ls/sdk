// CORE-ANALYZED-KIND-UTC-TOTALS-ROLLUPS-1 — the family + clock stamp.
//
// Every outbound envelope carries `kind` (when configured) and a page block
// with the client's UTC offset in integer minutes east plus an IANA
// timezone fill. The server files the session by `kind`
// (AnalyzedWriteService.resolveSessionKind) and stores the offset fill-only
// (resolveUtcOffset). Asserts the CONDITION on the captured envelope, never
// the absence of an error.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { createAnalyzing } from '../src/client.js'
import { bootAnalyzing, _resetBootForTests } from '../src/boot.js'

const EXPECTED_OFFSET = -new Date().getTimezoneOffset()

const shipOne = async (opts = {}) => {
  const captured = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => {
      captured.push(envelope)
      return { ok: true }
    },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1,
    ...opts
  })
  a.state.activate(null)
  a.captureMessage('hello', 'info')
  await new Promise((r) => setTimeout(r, 40))
  a.shutdown()
  return captured
}

test('kind: workspace is stamped on the outbound envelope', async () => {
  const [env] = await shipOne({ kind: 'workspace' })
  assert.ok(env, 'an envelope shipped')
  assert.equal(env.kind, 'workspace')
})

test('kind: project is stamped on the outbound envelope', async () => {
  const [env] = await shipOne({ kind: 'project' })
  assert.equal(env.kind, 'project')
})

test('no kind → no kind key (the server falls back to its projectId rule)', async () => {
  const [env] = await shipOne()
  assert.equal('kind' in env, false)
})

test('an invalid kind is ignored, not forwarded', async () => {
  const [env] = await shipOne({ kind: 'visitor' })
  assert.equal('kind' in env, false)
})

test('page.utcOffset = -getTimezoneOffset() (integer minutes EAST of UTC); page.timezone filled from Intl', async () => {
  const [env] = await shipOne({ kind: 'workspace' })
  assert.ok(env.page && typeof env.page === 'object', 'page block present even outside a browser')
  assert.equal(env.page.utcOffset, EXPECTED_OFFSET)
  assert.equal(Number.isInteger(env.page.utcOffset), true)
  assert.ok(env.page.utcOffset >= -840 && env.page.utcOffset <= 840, 'inside the real Earth range')
  assert.equal(env.page.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone)
})

test('the caller beforeSend still runs AFTER the stamp, sees it, and keeps its drop-by-null contract', async () => {
  const seen = []
  const captured = await shipOne({
    kind: 'workspace',
    beforeSend: (envelope) => {
      seen.push({ kind: envelope.kind, utcOffset: envelope.page?.utcOffset })
      envelope.tags = { ...(envelope.tags || {}), touched: 'yes' }
      return envelope
    }
  })
  assert.equal(seen.length >= 1, true, 'caller beforeSend ran')
  assert.deepEqual(seen[0], { kind: 'workspace', utcOffset: EXPECTED_OFFSET })
  assert.equal(captured[0].tags.touched, 'yes', 'the caller mutation shipped')
  assert.equal(captured[0].kind, 'workspace', 'the stamp survived the caller')

  const dropped = await shipOne({ kind: 'workspace', beforeSend: () => null })
  assert.equal(dropped.length, 0, 'returning null still drops the envelope')
})

test('a throwing caller beforeSend never loses the stamp (the stamped envelope ships)', async () => {
  const captured = await shipOne({
    kind: 'project',
    beforeSend: () => {
      throw new Error('caller bug')
    }
  })
  assert.equal(captured.length >= 1, true, 'the envelope still shipped')
  assert.equal(captured[0].kind, 'project')
  assert.equal(captured[0].page.utcOffset, EXPECTED_OFFSET)
})

// ── public mode (bootAnalyzing) — the published-site tracker ──────────────

const _origs = {}

beforeEach(() => {
  _resetBootForTests()
  _origs.window = globalThis.window
  _origs.document = globalThis.document
  _origs.location = globalThis.location
  _origs.history = globalThis.history
  _origs.fetch = globalThis.fetch
  const listeners = {}
  globalThis.window = {
    addEventListener: (n, fn) => {
      listeners[n] = listeners[n] || []
      listeners[n].push(fn)
    },
    __listeners: listeners
  }
  globalThis.document = { title: 'Test Page', referrer: 'https://ref.example' }
  globalThis.location = { pathname: '/p', search: '?q=1', host: 'proj.dev.symbo.ls' }
  globalThis.history = { pushState () {}, replaceState () {} }
})

afterEach(() => {
  globalThis.window = _origs.window
  globalThis.document = _origs.document
  globalThis.location = _origs.location
  globalThis.history = _origs.history
  globalThis.fetch = _origs.fetch
})

test('bootAnalyzing (public mode) posts kind: project + page.utcOffset through the ingest transport', async () => {
  const bodies = []
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return { ok: true, status: 204 }
  }
  const client = bootAnalyzing({ projectId: 'landing', ingestUrl: '/v1/analytics/ingest' })
  assert.ok(client, 'booted')
  client.flush()
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(bodies.length >= 1, 'the initial page_view envelope was posted')
  const body = bodies[0]
  assert.equal(body.kind, 'project')
  assert.equal(body.project_id, 'landing')
  assert.equal(body.page.utcOffset, EXPECTED_OFFSET)
  assert.equal(typeof body.page.timezone, 'string')
  assert.ok(body.events.some((e) => e.message === 'page_view'), 'page_view rides along')
  client.shutdown()
})
