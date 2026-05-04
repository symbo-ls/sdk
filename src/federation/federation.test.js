import { test } from 'node:test'
import assert from 'node:assert/strict'

// Mock @supabase/supabase-js so the federation factory doesn't try to
// open real network connections during the unit test.
import { Module } from 'node:module'
const _origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === '@supabase/supabase-js') {
    return new URL('./_supabase-stub.js', import.meta.url).pathname
  }
  return _origResolve.call(this, request, ...rest)
}

const { createFederation } = await import('./index.js')

test('createFederation returns an empty federation when no projects given', () => {
  const fed = createFederation()
  assert.deepEqual(fed.listConfiguredProjects(), [])
  assert.equal(fed.getDefaultClient(), null)
})

test('createFederation lists configured projects', () => {
  const fed = createFederation({
    projects: {
      gov: { key: 'gov', url: 'https://gov.supabase.co', anonKey: 'sb-gov-anon' },
      fin: { key: 'fin', url: 'https://fin.supabase.co', anonKey: 'sb-fin-anon' },
    },
    defaultKey: 'gov',
  })
  assert.deepEqual(fed.listConfiguredProjects().sort(), ['fin', 'gov'])
  assert.ok(fed.getProjectConfig('gov'))
  assert.equal(fed.getProjectConfig('missing'), null)
})

test('createFederation caches built clients per key', () => {
  const fed = createFederation({
    projects: { gov: { key: 'gov', url: 'https://x', anonKey: 'k' } },
    defaultKey: 'gov',
  })
  const a = fed.getClient('gov')
  const b = fed.getClient('gov')
  assert.equal(a, b, 'second call returns cached client')
})

test('createFederation reset() clears the cache', () => {
  const fed = createFederation({
    projects: { gov: { key: 'gov', url: 'https://x', anonKey: 'k' } },
    defaultKey: 'gov',
  })
  const a = fed.getClient('gov')
  fed.reset()
  const b = fed.getClient('gov')
  assert.notEqual(a, b, 'rebuilt client after reset')
})

test('createFederation forEachClient iterates configured projects', () => {
  const fed = createFederation({
    projects: {
      gov: { key: 'gov', url: 'https://x', anonKey: 'k' },
      fin: { key: 'fin', url: 'https://y', anonKey: 'k' },
    },
  })
  const visited = []
  fed.forEachClient((_client, key) => visited.push(key))
  assert.deepEqual(visited.sort(), ['fin', 'gov'])
})
