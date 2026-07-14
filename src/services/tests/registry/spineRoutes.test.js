import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the Phase-1 spine entities
// (WORKSPACE_DATA_MODEL §6.5/§6.8/§7/§8): proposedActions (approval spine),
// workflows/fieldDefs/recordCollections (CRUD). Verifies each op resolves
// the right service method with the right positional args for both caller
// shapes — imperative ({ id, payload, filter }) and the declarative
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

// ─── proposedActions — custom ops (approve/reject/result) ─────────────────────

test('proposedActions.create → proposedActions.propose with the bare payload', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('proposedActions', 'create', { payload: { actionKey: 'k', summary: 's' } })
  t.deepEqual(calls[0], {
    service: 'proposedActions',
    method: 'propose',
    args: [{ actionKey: 'k', summary: 's' }]
  })
  t.end()
})

test('proposedActions.approve / reject thread the id positionally', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('proposedActions', 'approve', { id: 'pa1' })
  await execute('proposedActions', 'reject', { id: 'pa2' })
  t.deepEqual(calls[0], { service: 'proposedActions', method: 'approve', args: ['pa1'] })
  t.deepEqual(calls[1], { service: 'proposedActions', method: 'reject', args: ['pa2'] })
  t.end()
})

test('proposedActions.result → setResult with (id, payload)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('proposedActions', 'result', { id: 'pa1', payload: { status: 'executed' } })
  t.deepEqual(calls[0], {
    service: 'proposedActions',
    method: 'setResult',
    args: ['pa1', { status: 'executed' }]
  })
  t.end()
})

test('proposedActions.list splits into (filter, options)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('proposedActions', 'list', { filter: { status: 'proposed' }, limit: 10 })
  t.equal(calls[0].service, 'proposedActions')
  t.equal(calls[0].method, 'list')
  t.deepEqual(calls[0].args[0], { status: 'proposed' }, 'filter')
  t.equal(calls[0].args[1].limit, 10, 'options carries limit')
  t.end()
})

// ─── workflows / fieldDefs / recordCollections — CRUD ─────────────────────────

for (const entity of ['workflows', 'fieldDefs', 'recordCollections']) {
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
