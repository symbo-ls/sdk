import test from 'tape'
import { createRegistry } from '../src/registry.js'

test('createRegistry throws without buildClient', (t) => {
  t.plan(1)
  t.throws(() => createRegistry(), /buildClient/)
})

test('getClient memoizes per project key', (t) => {
  t.plan(3)
  let calls = 0
  const reg = createRegistry({
    projects: { a: { url: 'A' }, b: { url: 'B' } },
    buildClient: (cfg) => {
      calls += 1
      return { id: cfg.url }
    }
  })
  const c1 = reg.getClient('a')
  const c2 = reg.getClient('a')
  const c3 = reg.getClient('b')
  t.equal(c1, c2, 'same client instance for same key')
  t.notEqual(c1, c3, 'distinct client per key')
  t.equal(calls, 2, 'buildClient invoked once per unique key')
})

test('addProject + removeProject reset cached client', (t) => {
  t.plan(3)
  const reg = createRegistry({
    projects: { a: { url: 'A1' } },
    buildClient: (cfg) => ({ url: cfg.url })
  })
  const first = reg.getClient('a')
  reg.addProject('a', { url: 'A2' })
  const second = reg.getClient('a')
  t.notEqual(first, second, 'cache invalidated on addProject overwrite')
  t.equal(second.url, 'A2', 'new config used')
  reg.removeProject('a')
  t.equal(reg.getClient('a'), null, 'getClient returns null after removeProject')
})

test('getClient returns null for unknown key without invoking buildClient', (t) => {
  t.plan(2)
  let invoked = false
  const reg = createRegistry({
    projects: {},
    buildClient: () => { invoked = true; return {} }
  })
  t.equal(reg.getClient('missing'), null)
  t.equal(invoked, false)
})
