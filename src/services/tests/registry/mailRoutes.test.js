import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the mail entities (architecture/MAIL.md §5.2,
// §7): 'mail.setup', 'mail.accounts', 'mail.admin', the §5.7 'mail.drafts' +
// 'mail.outbox', and the §5.2/§5.6 read path 'mail.threads' + 'mail.messages'
// (MAIL-SERVER-THREAD-READ-ROUTES-1) — the routes the server registers
// today. Verifies each op resolves the right service method with the right
// positional args for both caller shapes: the imperative bag ({ id,
// workspaceId, ... }) and the declarative fetch-adapter pack ({ filter,
// params, options }). The last test pins the ABSENT entities: an entry for a
// route that does not exist yet would answer 404 and read as a server fault.

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

// ─── mail.threads + mail.messages — the §5.2/§5.6 read path ─────────────────

test('mail.threads ops unpack their args (list keeps flat filters + hoists limit, update strips the pin, batch is a body)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.threads', 'list', { workspaceId: 'ws1', accountId: 'all', folder: 'inbox', unread: true, cursor: 'c1', limit: 50 })
  t.equal(calls[0].method, 'listThreads', 'list → listThreads')
  t.deepEqual(calls[0].args[0], { workspaceId: 'ws1', accountId: 'all', folder: 'inbox', unread: true, cursor: 'c1' }, 'flat keys become the filter')
  t.equal(calls[0].args[1].limit, 50, 'limit rides the options positional (listThreads reads both)')
  t.equal(calls[0].args[1].workspaceId, 'ws1', 'the pin rides the options too')
  await execute('mail.threads', 'get', { id: 't1', workspaceId: 'ws1' })
  t.deepEqual(calls[1], { service: 'mail', method: 'getThread', args: ['t1', { workspaceId: 'ws1' }] }, 'get(id, { workspaceId })')
  await execute('mail.threads', 'update', { id: 't1', workspaceId: 'ws1', read: true, folder: 'archive' })
  t.deepEqual(calls[2], { service: 'mail', method: 'updateThread', args: ['t1', { read: true, folder: 'archive' }, { workspaceId: 'ws1' }] }, 'update(id, flags, { workspaceId }) — the pin is stripped from the body')
  await execute('mail.threads', 'batch', { ids: ['t1', 't2'], workspaceId: 'ws1', starred: true })
  t.deepEqual(calls[3], { service: 'mail', method: 'batchThreads', args: [{ ids: ['t1', 't2'], starred: true }, { workspaceId: 'ws1' }] }, 'batch(body, { workspaceId })')
  t.end()
})

test('mail.messages ops: body(id, { workspaceId }); attachment(id, aid, { workspaceId })', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.messages', 'body', { id: 'm1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], { service: 'mail', method: 'getBody', args: ['m1', { workspaceId: 'ws1' }] }, 'body → getBody(id, { workspaceId })')
  await execute('mail.messages', 'attachment', { id: 'm1', aid: 'A1', workspaceId: 'ws1' })
  t.deepEqual(calls[1], { service: 'mail', method: 'attachmentUrl', args: ['m1', 'A1', { workspaceId: 'ws1' }] }, 'attachment → attachmentUrl(id, aid, { workspaceId })')
  await execute('mail.messages', 'attachment', { id: 'm1', attachmentId: 'A2' })
  t.deepEqual(calls[2].args, ['m1', 'A2'], 'attachmentId is accepted as the aid alias; no pin → no options positional')
  t.end()
})

// ─── mail.tenant + mail.shared — the §3.5 admin surface ──────────────────────

test('mail.tenant ops resolve the tenant methods (provider positional, dryRun body)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('mail.tenant', 'get', { workspaceId: 'ws1' })
  t.deepEqual(calls[0], { service: 'mail', method: 'getTenant', args: [{ workspaceId: 'ws1' }] }, 'get → getTenant({ workspaceId })')
  await execute('mail.tenant', 'consent', { provider: 'microsoft', workspaceId: 'ws1' })
  t.deepEqual(calls[1], { service: 'mail', method: 'tenantConsentUrl', args: ['microsoft', { workspaceId: 'ws1' }] }, 'consent(provider, { workspaceId })')
  await execute('mail.tenant', 'test', { provider: 'google', workspaceId: 'ws1' })
  t.deepEqual(calls[2], { service: 'mail', method: 'tenantTest', args: ['google', { workspaceId: 'ws1' }] }, 'test(provider, { workspaceId })')
  await execute('mail.tenant', 'provision', { provider: 'google', dryRun: true, workspaceId: 'ws1' })
  t.deepEqual(
    calls[3],
    { service: 'mail', method: 'tenantProvision', args: ['google', { dryRun: true }, { workspaceId: 'ws1' }] },
    'provision(provider, { dryRun }, { workspaceId }) — the dry run rides the body'
  )
  await execute('mail.tenant', 'provision', { provider: 'google', workspaceId: 'ws1' })
  t.deepEqual(calls[4].args, ['google', {}, { workspaceId: 'ws1' }], 'no dryRun key → an empty body, the server applies')
  t.end()
})

test('mail.shared ops unpack their args (create strips the pin, update is id+patch)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const access = [{ subjectType: 'role', subjectId: 'editor', level: 'write' }]
  await execute('mail.shared', 'create', { workspaceId: 'ws1', address: 'support@acme.com', name: 'Support', access })
  t.equal(calls[0].method, 'createShared', 'create → createShared')
  t.deepEqual(calls[0].args[0], { address: 'support@acme.com', name: 'Support', access }, 'the routing pin is stripped from the body')
  t.deepEqual(calls[0].args[1], { workspaceId: 'ws1' }, 'the pin rides in the options')
  await execute('mail.shared', 'update', { id: 's1', workspaceId: 'ws1', access, serviceDesk: { enabled: true } })
  t.deepEqual(
    calls[1].args,
    ['s1', { access, serviceDesk: { enabled: true } }, { workspaceId: 'ws1' }],
    'update(id, patch, { workspaceId }) → updateShared'
  )
  t.end()
})

// ─── The routes that must NOT be registered yet ──────────────────────────────

test('no mail entity is registered for a route the server does not serve yet', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  // Bare `mail` stays absent on purpose: §7 named it for threads, the shipped
  // read UI calls 'mail.threads', and two names for one entity is the drift
  // this file exists to refuse.
  const absent = ['mail']
  for (const entity of absent) {
    t.equal(execute.getRoute(entity), null, `${entity} is not routed until its server routes land`)
  }
  // mail.drafts + mail.outbox joined `present` when MAIL-SERVER-SEND-OUTBOX-1
  // registered the §5.7 routes; mail.threads + mail.messages when
  // MAIL-SERVER-THREAD-READ-ROUTES-1 registered the §5.2/§5.6 reads;
  // mail.tenant + mail.shared when MAIL-SERVER-TENANT-SHARED-ROUTES-1
  // registered the §3.5 admin tenant/shared surface.
  const present = ['mail.setup', 'mail.accounts', 'mail.admin', 'mail.drafts', 'mail.outbox', 'mail.threads', 'mail.messages', 'mail.tenant', 'mail.shared']
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
