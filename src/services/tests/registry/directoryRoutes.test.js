import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the Phase-2 directory entities
// (WORKSPACE_DATA_MODEL §5): parties (+ roles/relationships sub-resources),
// interactions, segments. Verifies each op resolves the right service method
// with the right positional args for both caller shapes — imperative
// ({ id, payload, partyId, ... }) and the declarative fetch-adapter pack
// ({ filter, params, options }).

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

// ─── parties / interactions / segments — CRUD ─────────────────────────────────

for (const entity of ['parties', 'interactions', 'segments']) {
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

// ─── parties — roles + relationships sub-resources ────────────────────────────
//
// Every sub-resource op emits a trailing `{ workspaceId }` opts positional
// UNCONDITIONALLY (undefined when the caller didn't scope) — a member's Party
// lives in the org's HQ workspace, so the route must be able to carry the
// scope (sdk@883835c). These assertions pin that arity.

test('parties.listRoles / listRelationships thread the partyId positionally', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'listRoles', { partyId: 'p1' })
  await execute('parties', 'listRelationships', { partyId: 'p1', workspaceId: 'w1' })
  t.deepEqual(
    calls[0],
    { service: 'parties', method: 'listRoles', args: ['p1', { workspaceId: undefined }] },
    'listRoles(partyId, { workspaceId }) — opts always emitted, undefined when unscoped'
  )
  t.deepEqual(
    calls[1],
    { service: 'parties', method: 'listRelationships', args: ['p1', { workspaceId: 'w1' }] },
    'listRelationships(partyId, { workspaceId }) carries the caller scope'
  )
  t.end()
})

test('parties.addRole → (partyId, body) for both packed + flat callers', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'addRole', { partyId: 'p1', payload: { role: 'customer' } })
  await execute('parties', 'addRole', { partyId: 'p2', role: 'vendor', tier: 'gold' })
  t.deepEqual(
    calls[0],
    {
      service: 'parties',
      method: 'addRole',
      args: ['p1', { role: 'customer' }, { workspaceId: undefined }]
    },
    'packed payload passes through'
  )
  t.deepEqual(
    calls[1],
    {
      service: 'parties',
      method: 'addRole',
      args: ['p2', { role: 'vendor', tier: 'gold' }, { workspaceId: undefined }]
    },
    'flat body strips partyId'
  )
  t.end()
})

test('parties.removeRole → (partyId, role)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'removeRole', { partyId: 'p1', role: 'customer' })
  t.deepEqual(calls[0], {
    service: 'parties',
    method: 'removeRole',
    args: ['p1', 'customer', { workspaceId: undefined }]
  })
  t.end()
})

test('parties.addRelationship → (partyId, {bId, kind})', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'addRelationship', {
    partyId: 'p1',
    payload: { bId: 'p2', kind: 'employed_by' }
  })
  t.deepEqual(calls[0], {
    service: 'parties',
    method: 'addRelationship',
    args: ['p1', { bId: 'p2', kind: 'employed_by' }, { workspaceId: undefined }]
  })
  t.end()
})

test('parties.removeRelationship → (relId) targets the edge by its own id', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('parties', 'removeRelationship', { relId: 'rel1' })
  t.deepEqual(calls[0], {
    service: 'parties',
    method: 'removeRelationship',
    args: ['rel1', { workspaceId: undefined }]
  })
  t.end()
})

// ─── segments — members evaluation ────────────────────────────────────────────

test('segments.members → listMembers(id)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('segments', 'members', { id: 's1' })
  t.deepEqual(calls[0], { service: 'segments', method: 'listMembers', args: ['s1'] })
  t.end()
})
