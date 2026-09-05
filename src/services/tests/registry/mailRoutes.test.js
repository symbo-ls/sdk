import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the mail entities (architecture/MAIL.md §5.2,
// §7). Three routes only — 'mail.setup', 'mail.accounts', 'mail.admin' —
// because those are the routes the server registers today. Verifies each op
// resolves the right service method with the right positional args for both
// caller shapes: the imperative bag ({ id, workspaceId, ... }) and the
// declarative fetch-adapter pack ({ filter, params, options }). The last test
// pins the ABSENT entities: an entry for a route that does not exist yet
// would answer 404 and read as a server fault.

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

// ─── mail.setup — the §3.2a gate: workspace pin only, no id, no body ─────────

test('mail.setup ops resolve the setup methods with the workspace pin only', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.setup', 'get', { workspaceId: 'ws1' })
  await execute('mail.setup', 'link', { workspaceId: 'ws1' })
  await execute('mail.setup', 'notifyAdmin', { workspaceId: 'ws1' })
  t.deepEqual(
    calls[0],
    { service: 'mail', method: 'getSetup', args: [{ workspaceId: 'ws1' }] },
    'get → getSetup({ workspaceId })'
  )
  t.deepEqual(
    calls[1],
    { service: 'mail', method: 'setupLink', args: [{ workspaceId: 'ws1' }] },
    'link → setupLink({ workspaceId })'
  )
  t.deepEqual(
    calls[2],
    { service: 'mail', method: 'setupNotifyAdmin', args: [{ workspaceId: 'ws1' }] },
    'notifyAdmin → setupNotifyAdmin({ workspaceId })'
  )
  t.end()
})

test('mail.setup reads the workspace pin out of the fetch-adapter packs too', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.setup', 'get', { params: { workspaceId: 'ws2' } })
  await execute('mail.setup', 'get', { filter: { workspaceId: 'ws3' } })
  t.deepEqual(calls[0].args, [{ workspaceId: 'ws2' }], 'params pack')
  t.deepEqual(calls[1].args, [{ workspaceId: 'ws3' }], 'filter pack')
  t.end()
})

// ─── mail.accounts — member reads/writes, no create ──────────────────────────

test('mail.accounts ops resolve the account methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.accounts', 'list', { filter: { workspaceId: 'ws1' } })
  await execute('mail.accounts', 'get', { id: 'a1' })
  await execute('mail.accounts', 'update', { id: 'a1', payload: { displayName: 'Support' } })
  await execute('mail.accounts', 'remove', { id: 'a1' })
  t.equal(calls[0].method, 'listAccounts', 'list → listAccounts')
  t.deepEqual(calls[0].args[0], { workspaceId: 'ws1' }, 'list filter')
  t.deepEqual(calls[1], { service: 'mail', method: 'getAccount', args: ['a1'] }, 'get(id)')
  t.deepEqual(
    calls[2],
    { service: 'mail', method: 'updateAccount', args: ['a1', { displayName: 'Support' }] },
    'update(id, payload)'
  )
  t.deepEqual(
    calls[3],
    { service: 'mail', method: 'disconnectAccount', args: ['a1'] },
    'remove(id) → disconnect (tombstone)'
  )
  t.end()
})

test('mail.accounts threads workspaceId into the trailing options positional', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.accounts', 'get', { id: 'a1', workspaceId: 'ws1' })
  await execute('mail.accounts', 'update', { id: 'a1', workspaceId: 'ws1', displayName: 'Support' })
  await execute('mail.accounts', 'remove', { id: 'a1', workspaceId: 'ws1' })
  t.deepEqual(calls[0].args, ['a1', { workspaceId: 'ws1' }], 'get(id, { workspaceId })')
  t.deepEqual(
    calls[1].args,
    ['a1', { displayName: 'Support' }, { workspaceId: 'ws1' }],
    'flat update strips the routing pin out of the body'
  )
  t.deepEqual(calls[2].args, ['a1', { workspaceId: 'ws1' }], 'remove(id, { workspaceId })')
  t.end()
})

// ─── mail.admin — health rows, force disconnect, audit ───────────────────────

test('mail.admin ops resolve the admin methods', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.admin', 'list', { workspaceId: 'ws1' })
  await execute('mail.admin', 'remove', { id: 'a1', workspaceId: 'ws1' })
  await execute('mail.admin', 'audit', { workspaceId: 'ws1', limit: 25 })
  t.equal(calls[0].method, 'adminListAccounts', 'list → adminListAccounts')
  t.deepEqual(calls[0].args[0], { workspaceId: 'ws1' }, 'the flat workspace pin becomes the filter')
  t.deepEqual(
    calls[1],
    { service: 'mail', method: 'adminDisconnect', args: ['a1', { workspaceId: 'ws1' }] },
    'remove(id, { workspaceId }) → force disconnect'
  )
  t.equal(calls[2].method, 'adminAudit', 'audit → adminAudit')
  t.deepEqual(calls[2].args[0], { workspaceId: 'ws1' }, 'audit filter carries the workspace pin')
  // The flat-args contract classes `limit` as a pagination option, so it
  // lands in the OPTIONS positional, not the filter. adminAudit reads both.
  t.equal(calls[2].args[1].limit, 25, 'audit limit rides on the options positional')
  t.end()
})

// ─── The routes that must NOT be registered yet ──────────────────────────────

test('no mail entity is registered for a route the server does not serve yet', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  const absent = ['mail', 'mail.messages', 'mail.drafts', 'mail.outbox', 'mail.tenant', 'mail.shared']
  for (const entity of absent) {
    t.equal(execute.getRoute(entity), null, `${entity} is not routed until its server routes land`)
  }
  const present = ['mail.setup', 'mail.accounts', 'mail.admin']
  for (const entity of present) {
    t.equal(execute.getRoute(entity)?.service, 'mail', `${entity} routes to the mail service`)
  }
  t.deepEqual(
    Object.keys(execute.getRoute('mail.accounts').methods),
    ['list', 'get', 'update', 'remove'],
    'mail.accounts has no create op — an account is born from the OAuth connect flow'
  )
  t.end()
})
