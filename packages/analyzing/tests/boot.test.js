// bootAnalyzing — the public-mode tracker entry the mermaid track stub
// calls. Regression for the 2026-08-14 seam gap: the stub had called
// `bootAnalyzing` since the tracker shipped while this package only
// exported `createAnalyzing`, so every published site silently ingested
// NOTHING (the stub's typeof guard swallowed the missing export).

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { bootAnalyzing, _resetBootForTests } from '../src/boot.js'

const _origs = {}

beforeEach(() => {
  _resetBootForTests()
  _origs.window = globalThis.window
  _origs.document = globalThis.document
  _origs.location = globalThis.location
  _origs.history = globalThis.history
  const listeners = {}
  globalThis.window = {
    addEventListener: (n, fn) => {
      listeners[n] = listeners[n] || []
      listeners[n].push(fn)
    },
    __listeners: listeners
  }
  globalThis.document = { title: 'Test Page', referrer: 'https://ref.example' }
  globalThis.location = {
    pathname: '/p',
    search: '?q=1',
    host: 'proj.dev.symbo.ls'
  }
  globalThis.history = {
    pushState() {},
    replaceState() {}
  }
})

afterEach(() => {
  globalThis.window = _origs.window
  globalThis.document = _origs.document
  globalThis.location = _origs.location
  globalThis.history = _origs.history
})

test('bootAnalyzing exists, boots a public client, and is idempotent', () => {
  const a = bootAnalyzing({
    projectId: 'landing',
    ingestUrl: '/v1/analytics/ingest'
  })
  assert.ok(a, 'returns a client')
  assert.equal(typeof a.capture, 'function')
  assert.equal(typeof a.flush, 'function')
  const b = bootAnalyzing({ projectId: 'other' })
  assert.equal(a, b, 'second boot returns the same instance')
})

test('bootAnalyzing ACTIVATES the analyze state (pre-activation emit drops everything)', () => {
  const a = bootAnalyzing({ projectId: 'landing' })
  // The silent-drop half of the seam bug: without state.activate(), every
  // non-error capture is discarded (plugins/analyze/src/state.js emit()
  // pre-ready branch) — a plain published site has no smbls create() to
  // activate it. bootAnalyzing must do it.
  assert.equal(a.state.__ready, true, 'analyze state activated at boot')
})

test('bootAnalyzing wires SPA page_views through history wrapping', () => {
  bootAnalyzing({ projectId: 'landing' })
  assert.equal(
    globalThis.history.pushState.__analyzingWrapped,
    true,
    'pushState wrapped'
  )
  assert.equal(
    globalThis.history.replaceState.__analyzingWrapped,
    true,
    'replaceState wrapped'
  )
})

test('bootAnalyzing registers a pagehide flush listener', () => {
  bootAnalyzing({ projectId: 'landing' })
  assert.ok(
    (globalThis.window.__listeners.pagehide || []).length >= 1,
    'pagehide listener registered'
  )
})
