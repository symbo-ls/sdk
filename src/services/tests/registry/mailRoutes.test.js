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
  const absent = ['mail', 'mail.messages', 'mail.tenant', 'mail.shared']
  for (const entity of absent) {
    t.equal(execute.getRoute(entity), null, `${entity} is not routed until its server routes land`)
  }
  // mail.drafts + mail.outbox joined `present` when MAIL-SERVER-SEND-OUTBOX-1
  // registered the §5.7 routes.
  const present = ['mail.setup', 'mail.accounts', 'mail.admin', 'mail.drafts', 'mail.outbox']
  for (const entity of present) {
    t.equal(execute.getRoute(entity)?.service, 'mail', `${entity} routes to the mail service`)
  }
  const accountOps = Object.keys(execute.getRoute('mail.accounts').methods)
  t.deepEqual(
    accountOps,
    ['list', 'get', 'update', 'remove', 'connect', 'reconnect', 'sync'],
    'mail.accounts: the CRUD reads/writes plus the personal OAuth connect / reconnect / sync-now'
  )
  t.notOk(accountOps.includes('create'), 'mail.accounts has no create op — an account is born from the OAuth connect flow (connect answers the authorize URL, the public callback creates the row)')
  t.end()
})

test('mail.accounts connect / reconnect / sync unpack their args', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.accounts', 'connect', { provider: 'google', workspaceId: 'ws1' })
  t.equal(calls[0].method, 'startConnect', 'connect → startConnect')
  t.equal(calls[0].args[0], 'google', 'the provider is the first positional')
  t.deepEqual(calls[0].args[1], { workspaceId: 'ws1' }, 'the workspace pin rides in the options')
  await execute('mail.accounts', 'reconnect', { id: 'a1', workspaceId: 'ws1' })
  t.equal(calls[1].method, 'reconnect', 'reconnect → reconnect')
  t.equal(calls[1].args[0], 'a1', 'the id is the first positional')
  await execute('mail.accounts', 'sync', { id: 'a1', workspaceId: 'ws1' })
  t.equal(calls[2].method, 'syncNow', 'sync → syncNow')
  t.deepEqual(calls[2].args[1], { workspaceId: 'ws1' }, 'sync carries the workspace pin')
  t.end()
})

// ─── mail.drafts + mail.outbox — the §5.7 send path ──────────────────────────

test('mail.drafts ops unpack their args (create strips the pin, attach passes the file positional)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.drafts', 'create', { workspaceId: 'ws1', account: 'a1', subject: 'Hi' })
  t.equal(calls[0].method, 'createDraft', 'create → createDraft')
  t.deepEqual(calls[0].args[0], { account: 'a1', subject: 'Hi' }, 'the routing pin is stripped from the body')
  t.deepEqual(calls[0].args[1], { workspaceId: 'ws1' }, 'the pin rides in the options')
  await execute('mail.drafts', 'update', { id: 'd1', workspaceId: 'ws1', subject: 'x' })
  t.deepEqual(calls[1].args, ['d1', { subject: 'x' }, { workspaceId: 'ws1' }], 'update(id, patch, { workspaceId })')
  await execute('mail.drafts', 'remove', { id: 'd1', workspaceId: 'ws1' })
  t.deepEqual(calls[2].args, ['d1', { workspaceId: 'ws1' }], 'remove(id, { workspaceId })')
  const file = { fake: 'blob' }
  await execute('mail.drafts', 'attach', { id: 'd1', file, workspaceId: 'ws1' })
  t.equal(calls[3].method, 'uploadDraftAttachment', 'attach → uploadDraftAttachment')
  t.equal(calls[3].args[0], 'd1', 'the draft id is the first positional')
  t.equal(calls[3].args[1], file, 'the file is the second positional, untouched')
  t.deepEqual(calls[3].args[2], { workspaceId: 'ws1' }, 'the pin rides in the options')
  t.end()
})

test('mail.outbox ops unpack their args', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.outbox', 'send', { workspaceId: 'ws1', draftId: 'd1', undoSeconds: 10 })
  t.equal(calls[0].method, 'send', 'send → send')
  t.deepEqual(calls[0].args[0], { draftId: 'd1', undoSeconds: 10 }, 'the send body keeps draftId + undoSeconds, pin stripped')
  t.deepEqual(calls[0].args[1], { workspaceId: 'ws1' }, 'the pin rides in the options')
  await execute('mail.outbox', 'list', { workspaceId: 'ws1', status: 'queued' })
  t.equal(calls[1].method, 'listOutbox', 'list → listOutbox')
  t.deepEqual(calls[1].args[0], { workspaceId: 'ws1', status: 'queued' }, 'flat keys become the filter')
  await execute('mail.outbox', 'cancel', { id: 'o1', workspaceId: 'ws1' })
  t.deepEqual(calls[2], { service: 'mail', method: 'cancelSend', args: ['o1', { workspaceId: 'ws1' }] }, 'cancel(id, { workspaceId }) → cancelSend')
  t.end()
})
