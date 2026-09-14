// CORE-ANALYZED-UTM-ATTRIBUTION-1 — the first-touch landing stamp.
//
// `page.landing = { url, referrer, utm: { source, medium, campaign, term,
// content } }` is captured ONCE at createAnalyzing time and rides on EVERY
// outbound envelope (SDK mode and public mode), inside `page` so the
// mermaid relay's fixed-field rebuild keeps it. `opts.landing` replaces the
// capture. The server records it $setOnInsert (AnalyzedWriteService
// .resolveLanding). Asserts the CONDITION on the captured envelope, never
// the absence of an error.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { createAnalyzing, captureLanding, LANDING_MAX_LEN, UTM_PARAMS } from '../src/client.js'
import { bootAnalyzing, _resetBootForTests } from '../src/boot.js'

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
  return { captured, a }
}

// ── captureLanding (pure over the globals it is handed) ───────────────────

test('captureLanding: url / referrer / utm_* from location + document; trimmed; empty omitted', () => {
  const out = captureLanding({
    location: {
      href: 'https://site.test/pricing?utm_source=%20Google%20&utm_medium=CPC&utm_campaign=Spring%20Sale&utm_term=&x=1',
      search: '?utm_source=%20Google%20&utm_medium=CPC&utm_campaign=Spring%20Sale&utm_term=&x=1'
    },
    document: { referrer: 'https://www.google.com/' }
  })
  assert.deepEqual(out, {
    url: 'https://site.test/pricing?utm_source=%20Google%20&utm_medium=CPC&utm_campaign=Spring%20Sale&utm_term=&x=1',
    referrer: 'https://www.google.com/',
    utm: { source: 'Google', medium: 'CPC', campaign: 'Spring Sale' }
  })
  assert.deepEqual(UTM_PARAMS, ['source', 'medium', 'campaign', 'term', 'content'])
})

test('captureLanding: no utm params → no utm key; no referrer → no referrer key; nothing → {}', () => {
  assert.deepEqual(
    captureLanding({ location: { href: 'https://site.test/', search: '' }, document: { referrer: '' } }),
    { url: 'https://site.test/' }
  )
  assert.deepEqual(captureLanding({ location: {}, document: {} }), {})
  assert.deepEqual(captureLanding({}), typeof location === 'undefined' ? {} : captureLanding({}))
})

test('captureLanding: every value is capped at LANDING_MAX_LEN (200)', () => {
  const long = 'a'.repeat(400)
  const out = captureLanding({
    location: { href: `https://site.test/${long}`, search: `?utm_campaign=${long}` },
    document: { referrer: `https://ref.test/${long}` }
  })
  assert.equal(LANDING_MAX_LEN, 200)
  assert.equal(out.url.length, 200)
  assert.equal(out.referrer.length, 200)
  assert.equal(out.utm.campaign.length, 200)
})

test('captureLanding never throws on a hostile location', () => {
  assert.deepEqual(
    captureLanding({
      location: {
        get href () {
          throw new Error('nope')
        }
      }
    }),
    {}
  )
})

// ── the stamp on the outbound envelope (SDK mode) ─────────────────────────

test('opts.landing is stamped as page.landing on every envelope, next to utcOffset / timezone', async () => {
  const landing = {
    url: 'https://site.test/?utm_source=google&utm_campaign=Launch',
    referrer: 'https://www.google.com/',
    utm: { source: 'google', campaign: 'Launch' }
  }
  const { captured } = await shipOne({ kind: 'project', landing })
  assert.ok(captured.length >= 1, 'an envelope shipped')
  assert.deepEqual(captured[0].page.landing, landing)
  assert.equal(typeof captured[0].page.utcOffset, 'number', 'the clock stamp is still there')
  assert.equal(captured[0].kind, 'project')
})

test('outside a browser (no location) with no override the stamp is an empty landing object, never a throw', async () => {
  const { captured } = await shipOne({})
  assert.ok(captured.length >= 1)
  assert.ok(captured[0].page && typeof captured[0].page === 'object')
  assert.deepEqual(captured[0].page.landing, captureLanding())
})

test('a non-object opts.landing is ignored (the capture is used)', async () => {
  const { captured } = await shipOne({ landing: 'https://site.test/' })
  assert.deepEqual(captured[0].page.landing, captureLanding())
})

test('the landing is FROZEN at create time: a later location change never moves it', async () => {
  const orig = globalThis.location
  globalThis.location = { href: 'https://site.test/?utm_source=first', search: '?utm_source=first' }
  try {
    const captured = []
    const a = createAnalyzing({
      appKey: 'app',
      transport: (envelope) => {
        captured.push(envelope)
        return { ok: true }
      },
      level: 'trace',
      batchMs: 5,
      maxBatch: 1
    })
    a.state.activate(null)
    globalThis.location = { href: 'https://site.test/next?utm_source=second', search: '?utm_source=second' }
    a.captureMessage('after navigation', 'info')
    await new Promise((r) => setTimeout(r, 40))
    a.shutdown()
    assert.ok(captured.length >= 1)
    assert.equal(captured[0].page.landing.url, 'https://site.test/?utm_source=first')
    assert.deepEqual(captured[0].page.landing.utm, { source: 'first' })
  } finally {
    globalThis.location = orig
  }
})

test('the caller beforeSend sees page.landing and its own mutation still ships', async () => {
  const seen = []
  const landing = { url: 'https://site.test/', utm: { campaign: 'X' } }
  const { captured } = await shipOne({
    landing,
    beforeSend: (envelope) => {
      seen.push(envelope.page?.landing)
      envelope.tags = { ...(envelope.tags || {}), touched: 'yes' }
      return envelope
    }
  })
  assert.deepEqual(seen[0], landing)
  assert.equal(captured[0].tags.touched, 'yes')
  assert.deepEqual(captured[0].page.landing, landing, 'the stamp survived the caller')
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
  globalThis.document = { title: 'Test Page', referrer: 'https://ref.example/post' }
  globalThis.location = {
    pathname: '/p',
    search: '?utm_source=Newsletter&utm_medium=email&utm_campaign=Sep&q=1',
    host: 'proj.dev.symbo.ls',
    href: 'https://proj.dev.symbo.ls/p?utm_source=Newsletter&utm_medium=email&utm_campaign=Sep&q=1'
  }
  globalThis.history = { pushState () {}, replaceState () {} }
})

afterEach(() => {
  globalThis.window = _origs.window
  globalThis.document = _origs.document
  globalThis.location = _origs.location
  globalThis.history = _origs.history
  globalThis.fetch = _origs.fetch
})

test('bootAnalyzing (public mode) posts page.landing (url + referrer + utm) inside `page` through the ingest transport', async () => {
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
  assert.deepEqual(body.page.landing, {
    url: 'https://proj.dev.symbo.ls/p?utm_source=Newsletter&utm_medium=email&utm_campaign=Sep&q=1',
    referrer: 'https://ref.example/post',
    utm: { source: 'Newsletter', medium: 'email', campaign: 'Sep' }
  })
  assert.equal(typeof body.page.utcOffset, 'number', 'the clock stamp still rides along')
  assert.ok(body.events.some((e) => e.message === 'page_view'), 'page_view rides along')
  client.shutdown()
})
