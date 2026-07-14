import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the Phase-3 commerce entities
// (WORKSPACE_DATA_MODEL §6.2/§6.3/§6.4): products, prices, agreements,
// transactions (plain CRUD), invoices (CRUD + issue custom op), and the
// company-profile workspace singleton (get + update, no id). Verifies each op
// resolves the right service method with the right positional args for both
// caller shapes — imperative ({ id, payload, ... }) and the declarative
// fetch-adapter pack ({ filter, params, options }).

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

// ─── products / prices / agreements / transactions — CRUD ─────────────────────

for (const entity of ['products', 'prices', 'agreements', 'transactions']) {
  test(`${entity} CRUD ops resolve the right service methods`, async t => {
    const calls = []
    const execute = createEntityDispatcher(makeSdk(calls))
    await execute(entity, 'list', { filter: { a: 1 } })
    await execute(entity, 'get', { id: 'x1' })
    await execute(entity, 'create', { payload: { name: 'n' } })
    await execute(entity, 'update', { id: 'x1', payload: { name: 'n2' } })
    await execute(entity, 'remove', { id: 'x1' })
    t.equal(calls[0].method, 'list', 'list')
    t.deepEqual(calls[0].args[0], { a: 1 }, 'list filter')
    t.deepEqual(calls[1], { service: entity, method: 'get', args: ['x1'] }, 'get(id)')
    t.deepEqual(calls[2], { service: entity, method: 'create', args: [{ name: 'n' }] }, 'create(payload)')
    t.deepEqual(
      calls[3],
      { service: entity, method: 'update', args: ['x1', { name: 'n2' }] },
      'update(id, payload)'
    )
    t.deepEqual(calls[4], { service: entity, method: 'remove', args: ['x1'] }, 'remove(id)')
    t.end()
  })
}

// ─── transactions — create carries allocations through the settlement body ────

test('transactions.create threads the allocations payload through', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const payload = { kind: 'payment', amount: 1900, allocations: [{ invoiceId: 'i1', amount: 1900 }] }
  await execute('transactions', 'create', { payload })
  t.deepEqual(calls[0], { service: 'transactions', method: 'create', args: [payload] }, 'create(payload) with allocations')
  t.end()
})

// ─── invoices — CRUD + issue custom op ────────────────────────────────────────

test('invoices CRUD ops resolve the right service methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('invoices', 'list', { filter: { direction: 'outbound' } })
  await execute('invoices', 'get', { id: 'i1' })
  await execute('invoices', 'create', { payload: { partyId: 'p1' } })
  await execute('invoices', 'update', { id: 'i1', payload: { dueAt: 'x' } })
  await execute('invoices', 'remove', { id: 'i1' })
  t.equal(calls[0].method, 'list', 'list')
  t.deepEqual(calls[0].args[0], { direction: 'outbound' }, 'list filter')
  t.deepEqual(calls[1], { service: 'invoices', method: 'get', args: ['i1'] }, 'get(id)')
  t.deepEqual(calls[2], { service: 'invoices', method: 'create', args: [{ partyId: 'p1' }] }, 'create(payload)')
  t.deepEqual(calls[3], { service: 'invoices', method: 'update', args: ['i1', { dueAt: 'x' }] }, 'update(id, payload)')
  t.deepEqual(calls[4], { service: 'invoices', method: 'remove', args: ['i1'] }, 'remove(id) → void')
  t.end()
})

test('invoices.issue → issue(id) threads the id positionally', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('invoices', 'issue', { id: 'i1' })
  t.deepEqual(calls[0], { service: 'invoices', method: 'issue', args: ['i1'] }, 'issue(id)')
  t.end()
})

// ─── companyProfile — workspace singleton (get + update, no id) ────────────────

test('companyProfile.get → get() with no positional args (singleton)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('companyProfile', 'get', { id: 'ignored' })
  t.deepEqual(calls[0], { service: 'companyProfile', method: 'get', args: [] }, 'get() drops any id')
  t.end()
})

test('companyProfile.update → update(payload), no id', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('companyProfile', 'update', { payload: { legalName: 'Acme' } })
  t.deepEqual(
    calls[0],
    { service: 'companyProfile', method: 'update', args: [{ legalName: 'Acme' }] },
    'update(payload) with no leading id'
  )
  t.end()
})
