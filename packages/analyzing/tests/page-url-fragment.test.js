// The per-event URLs of an envelope — `page.url` (location.href AT FLUSH
// TIME, built by @symbo.ls/analyze collectPageInfo), an error's `source`
// (ErrorEvent.filename) and a network event's `url` — never keep a URL
// fragment (fly docs/FUNNEL.md §2 "Privacy": events carry no free text; the
// symbols.app landing hands over to Fly with `#idea=<free text>&company=
// <name>`). The landing half lives in landing-stamp.test.js.
//
// @symbo.ls/analyze builds the page block only in a browser, and decides
// that ONCE, at import time (`typeof window.document`). So this file
// installs a browser-shaped global scope BEFORE it imports the client;
// node:test runs every test file in its own process, so no other file sees
// it. Asserts the CONDITION on the serialized envelope, never the absence
// of an error.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const HANDOFF = 'https://fly.symbols.app/blueprint?industry=x#idea=Secret%20idea&company=Acme'
const HANDOFF_NO_FRAGMENT = 'https://fly.symbols.app/blueprint?industry=x'

const listeners = {}
globalThis.window = globalThis
globalThis.addEventListener = (name, fn) => {
  listeners[name] = listeners[name] || []
  listeners[name].push(fn)
}
globalThis.removeEventListener = (name, fn) => {
  listeners[name] = (listeners[name] || []).filter((f) => f !== fn)
}
globalThis.document = {
  title: 'Blueprint',
  referrer: 'https://symbols.app/',
  visibilityState: 'visible',
  hidden: false,
  addEventListener () {},
  removeEventListener () {}
}
globalThis.location = {
  href: HANDOFF,
  pathname: '/blueprint',
  search: '?industry=x',
  hash: '#idea=Secret%20idea&company=Acme',
  host: 'fly.symbols.app'
}
globalThis.history = { pushState () {}, replaceState () {} }

const { createAnalyzing } = await import('../src/client.js')
const { bootAnalyzing, _resetBootForTests } = await import('../src/boot.js')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const assertNoFragment = (serialized, what) => {
  assert.equal(typeof serialized, 'string', `${what} is serialized`)
  assert.ok(!serialized.includes('#'), `${what}: no '#'`)
  assert.ok(!serialized.includes('Secret'), `${what}: no idea text`)
  assert.ok(!serialized.includes('Acme'), `${what}: no company name`)
}

// A transport-mode client (the SDK-mode path) that records what goes on the
// wire: the envelope serialized at transport time.
const wireClient = () => {
  const sent = []
  const client = createAnalyzing({
    appKey: 'fly',
    kind: 'project',
    visitor: false,
    transport: (envelope) => {
      sent.push(JSON.stringify(envelope))
      return { ok: true }
    },
    batchMs: 5,
    maxBatch: 1
  })
  client.state.activate(null)
  return { client, sent }
}

test('page.url — location.href at flush time — ships without the fragment; path + query intact', async () => {
  const { client, sent } = wireClient()
  client.captureMessage('funnel probe', 'info')
  await sleep(40)
  client.shutdown()
  assert.ok(sent.length >= 1, 'an envelope shipped')
  for (const body of sent) assertNoFragment(body, 'the envelope')
  const envelope = JSON.parse(sent[sent.length - 1])
  assert.equal(envelope.page.url, HANDOFF_NO_FRAGMENT, 'page.url keeps path + query')
  assert.equal(envelope.page.path, '/blueprint')
  assert.equal(envelope.page.referrer, 'https://symbols.app/')
  assert.equal(envelope.page.title, 'Blueprint', 'the rest of the page block is untouched')
  assert.equal(envelope.page.landing.url, HANDOFF_NO_FRAGMENT, 'the landing too')
  assert.ok(envelope.events.some((e) => e.message === 'funnel probe'))
})

test("an error's source (ErrorEvent.filename) and a network event's url ship without the fragment", async () => {
  const { client, sent } = wireClient()
  // A window error, as the browser dispatches it: both the client's own
  // pre-boot listener and the analyze plugin's window.onerror record it.
  const error = new Error('boom')
  for (const fn of listeners.error || []) {
    fn({ message: 'boom', filename: HANDOFF, lineno: 1, colno: 2, error })
  }
  // A network event (capture is opt-in) whose request URL has a fragment.
  client.setNetworkCapture(true)
  client.state.emitNetwork({ phase: 'success', source: 'window.fetch', url: HANDOFF, method: 'GET', status: 200, ok: true })
  await sleep(60)
  client.shutdown()
  assert.ok(sent.length >= 1, 'envelopes shipped')
  for (const body of sent) assertNoFragment(body, 'the envelope')
  const events = sent.flatMap((body) => JSON.parse(body).events)
  const errors = events.filter((e) => e.type === 'error' && e.message === 'boom')
  assert.deepEqual(
    errors.map((e) => e.hook).sort(),
    ['preboot.error', 'window.onerror'],
    'both error listeners recorded the error'
  )
  for (const e of errors) assert.equal(e.source, HANDOFF_NO_FRAGMENT, `${e.hook}: source keeps path + query`)
  const network = events.find((e) => e.type === 'network')
  assert.ok(network, 'the network event shipped')
  assert.equal(network.url, HANDOFF_NO_FRAGMENT, 'url keeps path + query')
  assert.equal(network.source, 'window.fetch', 'a non-URL source is unchanged')
})

test('bootAnalyzing (public mode): the posted page.url, landing and page_view carry no fragment', async () => {
  _resetBootForTests()
  const origFetch = globalThis.fetch
  const bodies = []
  globalThis.fetch = async (_url, init) => {
    bodies.push(init.body)
    return { ok: true, status: 204 }
  }
  try {
    const client = bootAnalyzing({ projectId: 'fly', ingestUrl: '/v1/analytics/ingest' })
    assert.ok(client, 'booted')
    client.flush()
    await sleep(40)
    client.shutdown()
    assert.ok(bodies.length >= 1, 'the page_view envelope was posted')
    for (const body of bodies) assertNoFragment(body, 'the posted body')
    const posted = JSON.parse(bodies[0])
    assert.equal(posted.page.url, HANDOFF_NO_FRAGMENT)
    assert.equal(posted.page.landing.url, HANDOFF_NO_FRAGMENT)
    const view = posted.events.find((e) => e.message === 'page_view')
    assert.ok(view, 'page_view rides along')
    assert.equal(view.data.path, '/blueprint?industry=x', 'the page_view path keeps path + query')
    assert.equal(view.data.referrer, 'https://symbols.app/')
  } finally {
    globalThis.fetch = origFetch
  }
})
