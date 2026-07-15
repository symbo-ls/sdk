import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the §7 spine-capability entities
// (WORKSPACE_DATA_MODEL §7.3–§7.6/§6.9): comments (threaded discussion),
// attachments (files on anything), watchers (subscribe anyone to anything),
// activityEntries (read-only timeline), tags (the workspace tag registry).
// Verifies each op resolves the right service method with the right positional
// args for every caller shape — imperative flat ({ entityType, entityId }),
// the { filter } pack, and the declarative fetch-adapter pack
// ({ filter: params, params, ...params }). All key on entityRef { type, id }.

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

// ─── comments — list (filter bag) + create/update/remove; NO get ──────────────

test('comments.list threads the entityRef filter bag — flat, packed + fetch-adapter shapes', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('comments', 'list', { entityType: 'ticket', entityId: 't1' }) // flat
  await execute('comments', 'list', { filter: { entityType: 'ticket', entityId: 't1' } }) // packed
  await execute('comments', 'list', {
    filter: { entityType: 'ticket', entityId: 't1' },
    params: { entityType: 'ticket', entityId: 't1' },
    entityType: 'ticket',
    entityId: 't1'
  }) // declarative fetch-adapter pack
  for (let i = 0; i < 3; i++) {
    t.equal(calls[i].method, 'list', `call ${i} → list`)
    t.deepEqual(calls[i].args[0], { entityType: 'ticket', entityId: 't1' }, `call ${i} filter bag`)
  }
  t.end()
})

test('comments create/update/remove resolve the right positional args', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('comments', 'create', { payload: { entityRef: { type: 'ticket', id: 't1' }, body: 'hi' } })
  await execute('comments', 'update', { id: 'c1', payload: { body: 'edited' } })
  await execute('comments', 'remove', { id: 'c1' })
  t.deepEqual(calls[0], { service: 'comments', method: 'create', args: [{ entityRef: { type: 'ticket', id: 't1' }, body: 'hi' }] }, 'create(payload)')
  t.deepEqual(calls[1], { service: 'comments', method: 'update', args: ['c1', { body: 'edited' }] }, 'update(id, payload)')
  t.deepEqual(calls[2], { service: 'comments', method: 'remove', args: ['c1'] }, 'remove(id)')
  t.end()
})

test('comments does NOT support get (no GET /comments/:id on the server)', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  t.throws(() => execute('comments', 'get', { id: 'c1' }), /does not support op 'get'/, 'get op rejected')
  t.end()
})

// ─── attachments — list + create + remove; NO update ──────────────────────────

test('attachments list/create/remove resolve the right positional args', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('attachments', 'list', { entityType: 'doc', entityId: 'd1' })
  await execute('attachments', 'create', { payload: { entityRef: { type: 'doc', id: 'd1' }, file: 'f1' } })
  await execute('attachments', 'remove', { id: 'a1' })
  t.deepEqual(calls[0].args[0], { entityType: 'doc', entityId: 'd1' }, 'list filter bag')
  t.deepEqual(calls[1], { service: 'attachments', method: 'create', args: [{ entityRef: { type: 'doc', id: 'd1' }, file: 'f1' }] }, 'create(payload)')
  t.deepEqual(calls[2], { service: 'attachments', method: 'remove', args: ['a1'] }, 'remove(id)')
  t.end()
})

test('attachments does NOT support update (no PATCH /attachments/:id)', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  t.throws(() => execute('attachments', 'update', { id: 'a1' }), /does not support op 'update'/, 'update op rejected')
  t.end()
})

// ─── watchers — list + watch (upsert) + unwatch (by query) ────────────────────

test('watchers.watch → watch(payload, { workspaceId }) for packed + flat callers', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('watchers', 'watch', { payload: { entityRef: { type: 'ticket', id: 't1' }, level: 'all' }, workspaceId: 'ws1' })
  await execute('watchers', 'watch', { entityRef: { type: 'ticket', id: 't1' }, level: 'mentions' })
  t.deepEqual(calls[0].args[0], { entityRef: { type: 'ticket', id: 't1' }, level: 'all' }, 'packed payload passes through')
  t.equal(calls[0].args[1].workspaceId, 'ws1', 'watch threads workspaceId as option')
  t.deepEqual(calls[1].args[0], { entityRef: { type: 'ticket', id: 't1' }, level: 'mentions' }, 'flat payload passes through')
  t.equal(calls[1].method, 'watch', 'resolves the upsert method')
  t.end()
})

test('watchers.unwatch → unwatch(filter bag) by query (no id)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('watchers', 'unwatch', { entityType: 'ticket', entityId: 't1', userEmail: 'a@b.co' })
  t.equal(calls[0].method, 'unwatch', 'resolves unwatch')
  t.deepEqual(calls[0].args[0], { entityType: 'ticket', entityId: 't1', userEmail: 'a@b.co' }, 'filter bag passes through')
  t.end()
})

test('watchers.list threads the scope filter bag (entity or userEmail)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('watchers', 'list', { userEmail: 'a@b.co' })
  t.deepEqual(calls[0].args[0], { userEmail: 'a@b.co' }, 'userEmail-scoped list')
  t.end()
})

// ─── activityEntries — list ONLY (read-only) ──────────────────────────────────

test('activityEntries.list threads the filter bag + hoists top-level limit into options', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('activityEntries', 'list', { entityType: 'ticket', entityId: 't1' })
  await execute('activityEntries', 'list', { filter: { since: '2026-07-01' }, limit: 50 })
  t.deepEqual(calls[0].args[0], { entityType: 'ticket', entityId: 't1' }, 'entity-scoped timeline filter')
  t.deepEqual(calls[1].args[0], { since: '2026-07-01' }, 'feed filter bag')
  t.equal(calls[1].args[1].limit, 50, 'top-level limit hoisted into the options positional')
  t.end()
})

test('activityEntries is read-only — create/update/remove ops are rejected', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  t.throws(() => execute('activityEntries', 'create', {}), /does not support op 'create'/, 'no create')
  t.throws(() => execute('activityEntries', 'update', {}), /does not support op 'update'/, 'no update')
  t.throws(() => execute('activityEntries', 'remove', {}), /does not support op 'remove'/, 'no remove')
  t.end()
})

// ─── tags — CRUD + group filter ───────────────────────────────────────────────

test('tags CRUD ops resolve the right service methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('tags', 'list', { group: 'priority' })
  await execute('tags', 'get', { id: 't1' })
  await execute('tags', 'create', { payload: { key: 'urgent', label: 'Urgent' } })
  await execute('tags', 'update', { id: 't1', payload: { label: 'Renamed' } })
  await execute('tags', 'remove', { id: 't1' })
  t.deepEqual(calls[0].args[0], { group: 'priority' }, 'list threads group filter bag')
  t.deepEqual(calls[1], { service: 'tags', method: 'get', args: ['t1'] }, 'get(id)')
  t.deepEqual(calls[2], { service: 'tags', method: 'create', args: [{ key: 'urgent', label: 'Urgent' }] }, 'create(payload)')
  t.deepEqual(calls[3], { service: 'tags', method: 'update', args: ['t1', { label: 'Renamed' }] }, 'update(id, payload)')
  t.deepEqual(calls[4], { service: 'tags', method: 'remove', args: ['t1'] }, 'remove(id)')
  t.end()
})
