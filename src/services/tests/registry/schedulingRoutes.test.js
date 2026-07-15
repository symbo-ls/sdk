import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the Phase-4 scheduling entities
// (WORKSPACE_DATA_MODEL §6.5/§6.7/§6.8): bookings (CRUD + confirm custom op +
// cancel-delete), availabilityRules + recurrences (plain CRUD), and
// conversations (CRUD + the messages/addMessage sub-resource threading the
// parent conversationId — PartyService roles/relationships precedent). Verifies
// each op resolves the right service method with the right positional args for
// both caller shapes — imperative ({ id, payload, conversationId, ... }) and
// the declarative fetch-adapter pack ({ filter, params, options }).

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

// ─── availabilityRules / recurrences — plain CRUD ─────────────────────────────

for (const entity of ['availabilityRules', 'recurrences']) {
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

// ─── bookings — CRUD + confirm custom op + cancel-delete ──────────────────────

test('bookings CRUD ops resolve the right service methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('bookings', 'list', { filter: { status: 'requested' } })
  await execute('bookings', 'get', { id: 'b1' })
  await execute('bookings', 'create', { payload: { kind: 'call' } })
  await execute('bookings', 'update', { id: 'b1', payload: { location: 'Room 2' } })
  await execute('bookings', 'remove', { id: 'b1' })
  t.equal(calls[0].method, 'list', 'list')
  t.deepEqual(calls[0].args[0], { status: 'requested' }, 'list filter')
  t.deepEqual(calls[1], { service: 'bookings', method: 'get', args: ['b1'] }, 'get(id)')
  t.deepEqual(calls[2], { service: 'bookings', method: 'create', args: [{ kind: 'call' }] }, 'create(payload)')
  t.deepEqual(calls[3], { service: 'bookings', method: 'update', args: ['b1', { location: 'Room 2' }] }, 'update(id, payload)')
  t.deepEqual(calls[4], { service: 'bookings', method: 'remove', args: ['b1'] }, 'remove(id) → cancel')
  t.end()
})

test('bookings.confirm → confirm(id) threads the id positionally', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('bookings', 'confirm', { id: 'b1' })
  t.deepEqual(calls[0], { service: 'bookings', method: 'confirm', args: ['b1'] }, 'confirm(id)')
  t.end()
})

// ─── conversations — CRUD + messages/addMessage sub-resource ──────────────────

test('conversations CRUD ops resolve the right service methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('conversations', 'list', { filter: { status: 'open' } })
  await execute('conversations', 'get', { id: 'c1' })
  await execute('conversations', 'create', { payload: { channel: 'webchat' } })
  await execute('conversations', 'update', { id: 'c1', payload: { status: 'closed' } })
  await execute('conversations', 'remove', { id: 'c1' })
  t.deepEqual(calls[0].args[0], { status: 'open' }, 'list filter')
  t.deepEqual(calls[1], { service: 'conversations', method: 'get', args: ['c1'] }, 'get(id)')
  t.deepEqual(calls[2], { service: 'conversations', method: 'create', args: [{ channel: 'webchat' }] }, 'create(payload)')
  t.deepEqual(calls[3], { service: 'conversations', method: 'update', args: ['c1', { status: 'closed' }] }, 'update(id, payload)')
  t.deepEqual(calls[4], { service: 'conversations', method: 'remove', args: ['c1'] }, 'remove(id) → tombstone')
  t.end()
})

test('conversations.messages → listMessages(conversationId) for conversationId + id aliases', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('conversations', 'messages', { conversationId: 'c1' })
  await execute('conversations', 'messages', { id: 'c1' })
  t.deepEqual(calls[0], { service: 'conversations', method: 'listMessages', args: ['c1'] }, 'messages op resolves listMessages(conversationId)')
  t.deepEqual(calls[1].args, ['c1'], 'id aliases conversationId')
  t.end()
})

test('conversations.addMessage → addMessage(conversationId, body) for packed + flat callers', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  // packed: body under .payload
  await execute('conversations', 'addMessage', {
    conversationId: 'c1',
    payload: { direction: 'outbound', from: 'a@x.co', to: 'p@x.co', body: 'hi', attachments: [] }
  })
  // flat: message fields alongside conversationId (stripped from the body)
  await execute('conversations', 'addMessage', { conversationId: 'c1', direction: 'inbound', body: 'hey' })
  t.equal(calls[0].method, 'addMessage', 'resolves addMessage')
  t.equal(calls[0].args[0], 'c1', 'conversationId first (packed)')
  t.deepEqual(
    calls[0].args[1],
    { direction: 'outbound', from: 'a@x.co', to: 'p@x.co', body: 'hi', attachments: [] },
    'packed payload passes through as the message body'
  )
  t.equal(calls[1].args[0], 'c1', 'conversationId first (flat)')
  t.deepEqual(calls[1].args[1], { direction: 'inbound', body: 'hey' }, 'flat body strips conversationId')
  t.end()
})
