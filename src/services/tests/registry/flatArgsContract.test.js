import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Flat-args contract (tickets/sdk.md, 2026-07-23) — the dispatch layer must
// treat BOTH caller shapes identically for the workspace-scoped entities:
//
//   flat    execute('parties', 'list', { kind: 'company', workspaceId })
//   nested  execute('parties', 'list', { filter: { kind: 'company', workspaceId } })
//
// The old filterOptions adapter read ONLY `a.filter ?? a.params`, so every
// flat filter key was silently dropped: the request went out unscoped and the
// server's active-workspace claim fallback answered for whichever workspace
// was last active — an empty (or wrong-tenant) result that read as "no data"
// (cost a live debugging session against real rows). These tests pin:
//   1. flat keys become the filter; the nested pack still wins unchanged
//   2. `workspaceId` (a routing param) rides the options bag in both shapes
//   3. WS routes thread workspaceId into the trailing opts positional of
//      get/create/update/remove — ONLY when the caller provided it
//   4. legacy routes (tickets) keep byte-identical positional arity, so a
//      trailing flag positional (e.g. a hard-delete boolean) can never
//      receive a truthy opts object

const makeSdk = (calls) => ({
  getService: (name) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string') return undefined
          return (...args) => {
            calls.push({ service: name, method, args })
            return Promise.resolve({ ok: true })
          }
        }
      }
    )
})

const WS_ENTITIES = [
  'parties',
  'interactions',
  'segments',
  'products',
  'prices',
  'agreements',
  'invoices',
  'transactions',
  'bookings',
  'availabilityRules',
  'conversations',
  'recurrences'
]

test('list: flat filter keys reach the service filter (all WS entities)', async t => {
  for (const entity of WS_ENTITIES) {
    const calls = []
    const execute = createEntityDispatcher(makeSdk(calls))
    await execute(entity, 'list', { kind: 'company', workspaceId: 'w1', limit: 5 })
    const [filter, options] = calls[0].args
    t.deepEqual(
      filter,
      { kind: 'company', workspaceId: 'w1' },
      `${entity}: flat keys become the filter (option keys excluded)`
    )
    t.equal(options.limit, 5, `${entity}: limit split into options`)
    t.equal(options.workspaceId, 'w1', `${entity}: workspaceId also rides options`)
  }
  t.end()
})

test('list: nested filter pack still wins; sibling workspaceId reaches options', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'list', { filter: { kind: 'person' }, workspaceId: 'w9' })
  const [filter, options] = calls[0].args
  t.deepEqual(filter, { kind: 'person' }, 'nested pack is the filter, verbatim')
  t.equal(options.workspaceId, 'w9', 'sibling workspaceId lands on options')
  t.end()
})

test('list: both shapes produce the same filter (the contract)', async t => {
  const flatCalls = []
  const nestedCalls = []
  await createEntityDispatcher(makeSdk(flatCalls))('interactions', 'list', {
    direction: 'in',
    workspaceId: 'w1'
  })
  await createEntityDispatcher(makeSdk(nestedCalls))('interactions', 'list', {
    filter: { direction: 'in', workspaceId: 'w1' }
  })
  t.deepEqual(flatCalls[0].args[0], nestedCalls[0].args[0], 'identical filter positional')
  t.end()
})

test('WS get/create/update/remove thread workspaceId into the trailing opts', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'get', { id: 'p1', workspaceId: 'w1' })
  await execute('parties', 'create', { payload: { kind: 'company', name: 'Acme' }, workspaceId: 'w1' })
  await execute('parties', 'create', { kind: 'company', name: 'Flat Co', workspaceId: 'w1' })
  await execute('parties', 'update', { id: 'p1', payload: { name: 'Acme 2' }, workspaceId: 'w1' })
  await execute('parties', 'update', { id: 'p1', name: 'Flat 2', workspaceId: 'w1' })
  await execute('parties', 'remove', { id: 'p1', workspaceId: 'w1' })

  t.deepEqual(calls[0].args, ['p1', { workspaceId: 'w1' }], 'get(id, { workspaceId })')
  t.deepEqual(
    calls[1].args,
    [{ kind: 'company', name: 'Acme' }, { workspaceId: 'w1' }],
    'create(payload, { workspaceId }) — packed'
  )
  t.deepEqual(
    calls[2].args,
    [{ kind: 'company', name: 'Flat Co' }, { workspaceId: 'w1' }],
    'create — flat body: workspaceId stripped from the payload, threaded as opts'
  )
  t.deepEqual(
    calls[3].args,
    ['p1', { name: 'Acme 2' }, { workspaceId: 'w1' }],
    'update(id, payload, { workspaceId }) — packed'
  )
  t.deepEqual(
    calls[4].args,
    ['p1', { name: 'Flat 2' }, { workspaceId: 'w1' }],
    'update — flat body: id + workspaceId stripped from the payload'
  )
  t.deepEqual(calls[5].args, ['p1', { workspaceId: 'w1' }], 'remove(id, { workspaceId })')
  t.end()
})

test('WS ops WITHOUT workspaceId keep the exact pre-fix arity (no empty opts)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('products', 'get', { id: 'x1' })
  await execute('products', 'create', { payload: { name: 'n' } })
  await execute('products', 'update', { id: 'x1', payload: { name: 'n2' } })
  await execute('products', 'remove', { id: 'x1' })
  t.deepEqual(calls[0].args, ['x1'], 'get(id) — single positional')
  t.deepEqual(calls[1].args, [{ name: 'n' }], 'create(payload) — single positional')
  t.deepEqual(calls[2].args, ['x1', { name: 'n2' }], 'update(id, payload) — two positionals')
  t.deepEqual(calls[3].args, ['x1'], 'remove(id) — single positional')
  t.end()
})

test('legacy routes (tickets) are untouched — workspaceId never grows a positional', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('tickets', 'get', { id: 't1', workspaceId: 'w1' })
  await execute('tickets', 'remove', { id: 't1', workspaceId: 'w1' })
  t.deepEqual(
    calls[0].args,
    ['t1'],
    'tickets.get stays (id) — a trailing flag positional can never receive an opts object'
  )
  t.deepEqual(calls[1].args, ['t1'], 'tickets.remove stays (id)')
  // The list flat-filter fix IS global — legacy lists gain it too.
  await execute('tickets', 'list', { status: 'open' })
  t.deepEqual(calls[2].args[0], { status: 'open' }, 'tickets.list gains flat filter keys')
  t.end()
})
