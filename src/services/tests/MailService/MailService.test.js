import test from 'tape'
import sinon from 'sinon'
import { MailService } from '../../MailService.js'

// Request-shape + contract tests for the /core/mail/* wrapper
// (architecture/MAIL.md §5.2, §3.2a). Two layers:
//
//   1. `_call` stubbed — proves the method name, the path, the HTTP verb and
//      the body each method sends, plus the workspaceId query threading.
//   2. `fetch` stubbed — proves the whole `_call` → `_request` path: the
//      `/core` prefix, the envelope tolerance, and the typed errors the
//      server answers with today (501 on setup/link, 429 on notify-admin,
//      404 on an account the viewer may not see).

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new MailService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// A service wired for the fetch layer: a base URL and no token manager (the
// auth block is skipped when `_tokenManager` is null).
const makeFetchService = () => {
  const svc = makeService()
  svc._apiUrl = 'https://api.test'
  return svc
}

const fakeResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body
})

// ─── Setup gate (§3.2a) ──────────────────────────────────────────────────────

test('mail.getSetup GETs /mail/setup', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ state: 'ask-admin' })
  await svc.getSetup()
  t.equal(stub.firstCall.args[0], 'mail.getSetup', 'name')
  t.equal(stub.firstCall.args[1], '/mail/setup', 'no query string')
  t.equal(stub.firstCall.args[2], undefined, 'GET — no options')
  sandbox.restore()
  t.end()
})

test('mail.setupNotifyAdmin POSTs /mail/setup/notify-admin with no body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ notified: 2 })
  await svc.setupNotifyAdmin()
  t.equal(stub.firstCall.args[0], 'mail.setupNotifyAdmin', 'name')
  t.equal(stub.firstCall.args[1], '/mail/setup/notify-admin', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.equal(stub.firstCall.args[2].body, undefined, 'no body')
  sandbox.restore()
  t.end()
})

test('mail.setupLink POSTs /mail/setup/link with no body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ linked: true })
  await svc.setupLink()
  t.equal(stub.firstCall.args[0], 'mail.setupLink', 'name')
  t.equal(stub.firstCall.args[1], '/mail/setup/link', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.equal(stub.firstCall.args[2].body, undefined, 'no body — the frozen contract takes workspaceId only')
  sandbox.restore()
  t.end()
})

// ─── Personal OAuth: connect / reconnect / sync-now ─────────────────────────

test('mail.startConnect POSTs /mail/accounts/connect/:provider with no body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ authorizeUrl: 'https://accounts.google.com/x' })
  await svc.startConnect('google')
  t.equal(stub.firstCall.args[0], 'mail.startConnect', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts/connect/google', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.equal(stub.firstCall.args[2].body, undefined, 'no body — the policy and the viewer are server-side facts')
  sandbox.restore()
  t.end()
})

test('mail.reconnect POSTs /mail/accounts/:id/reconnect encoded', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.reconnect('a/1')
  t.equal(stub.firstCall.args[0], 'mail.reconnect', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts/a%2F1/reconnect', 'encoded path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  sandbox.restore()
  t.end()
})

test('mail.syncNow POSTs /mail/accounts/:id/sync', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ enqueued: true })
  await svc.syncNow('a1')
  t.equal(stub.firstCall.args[0], 'mail.syncNow', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts/a1/sync', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  sandbox.restore()
  t.end()
})

test('connect / reconnect / sync thread workspaceId as a query param', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.startConnect('google', { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[1], '/mail/accounts/connect/google?workspaceId=ws1', 'connect')
  await svc.reconnect('a1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[1], '/mail/accounts/a1/reconnect?workspaceId=ws1', 'reconnect')
  await svc.syncNow('a1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(2).args[1], '/mail/accounts/a1/sync?workspaceId=ws1', 'sync')
  sandbox.restore()
  t.end()
})

test('a 202 from sync-now with the pending seam answer is a plain result, not an error', async t => {
  t.plan(2)
  const svc = makeFetchService()
  sandbox.stub(globalThis, 'fetch').resolves(
    fakeResponse(202, { accountId: 'a1', enqueued: false, pending: 'sync_engine_pending', owner: 'MAIL-SERVER-SYNC-ENGINE-1' })
  )
  const r = await svc.syncNow('a1', { workspaceId: 'ws1' })
  t.equal(r.enqueued, false, '202 body returned')
  t.equal(r.pending, 'sync_engine_pending', 'the seam names the pending engine')
  sandbox.restore()
  t.end()
})

test('startConnect surfaces a 403 personal_not_allowed with its reason', async t => {
  t.plan(3)
  const svc = makeFetchService()
  sandbox.stub(globalThis, 'fetch').resolves(
    fakeResponse(403, { error: 'personal_not_allowed', message: 'the workspace policy does not allow this personal account', reason: 'domain_not_allowed' })
  )
  try {
    await svc.startConnect('google', { workspaceId: 'ws1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 403, 'status')
    t.equal(err.cause.error, 'personal_not_allowed', 'code on cause')
    t.equal(err.cause.reason, 'domain_not_allowed', 'reason on cause')
  }
  sandbox.restore()
  t.end()
})

// ─── Accounts (member) ───────────────────────────────────────────────────────

test('mail.listAccounts GETs the bare collection', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listAccounts()
  t.equal(stub.firstCall.args[0], 'mail.listAccounts', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts', 'no query string')
  sandbox.restore()
  t.end()
})

test('mail.getAccount GETs /mail/accounts/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getAccount('a/1')
  t.equal(stub.firstCall.args[0], 'mail.getAccount', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts/a%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('mail.updateAccount PATCHes /mail/accounts/:id with the allowlisted body', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { displayName: 'Support', signature: { html: '<p>hi</p>', text: 'hi' } }
  await svc.updateAccount('a1', payload)
  t.equal(stub.firstCall.args[1], '/mail/accounts/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('mail.disconnectAccount DELETEs /mail/accounts/:id (tombstone)', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.disconnectAccount('a1')
  t.equal(stub.firstCall.args[0], 'mail.disconnectAccount', 'name')
  t.equal(stub.firstCall.args[1], '/mail/accounts/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE (disable-not-hard-delete)')
  sandbox.restore()
  t.end()
})

// ─── Admin surface (§3.5) ────────────────────────────────────────────────────

test('mail.adminListAccounts GETs /mail/admin/accounts', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.adminListAccounts()
  t.equal(stub.firstCall.args[0], 'mail.adminListAccounts', 'name')
  t.equal(stub.firstCall.args[1], '/mail/admin/accounts', 'path')
  sandbox.restore()
  t.end()
})

test('mail.adminDisconnect DELETEs /mail/admin/accounts/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.adminDisconnect('a1')
  t.equal(stub.firstCall.args[0], 'mail.adminDisconnect', 'name')
  t.equal(stub.firstCall.args[1], '/mail/admin/accounts/a1', 'admin path, not the member one')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('mail.adminAudit GETs /mail/admin/audit and threads limit', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.adminAudit()
  t.equal(stub.getCall(0).args[1], '/mail/admin/audit', 'no query when no filter')
  await svc.adminAudit({ limit: 10 })
  t.equal(stub.getCall(1).args[1], '/mail/admin/audit?limit=10', 'limit threaded')
  await svc.adminAudit({ limit: 10, workspaceId: 'ws1' })
  t.equal(
    stub.getCall(2).args[1],
    '/mail/admin/audit?limit=10&workspaceId=ws1',
    'limit + workspaceId threaded together'
  )
  await svc.adminAudit({}, { limit: 10 })
  t.equal(
    stub.getCall(3).args[1],
    '/mail/admin/audit?limit=10',
    'limit read off the options bag — the dispatcher hoists it out of the filter'
  )
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('mail threads workspaceId as a query param on every route', async t => {
  t.plan(10)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getSetup({ workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'setup threads ws')
  await svc.setupNotifyAdmin({ workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'notify-admin threads ws')
  await svc.setupLink({ workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'setup/link threads ws')
  await svc.listAccounts({ workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'listAccounts threads ws')
  await svc.getAccount('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'getAccount threads ws')
  await svc.updateAccount('a1', { displayName: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(5).args[1].includes('workspaceId=ws1'), 'updateAccount threads ws')
  await svc.disconnectAccount('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(6).args[1].includes('workspaceId=ws1'), 'disconnectAccount threads ws')
  await svc.adminListAccounts({ workspaceId: 'ws1' })
  t.ok(stub.getCall(7).args[1].includes('workspaceId=ws1'), 'adminListAccounts threads ws')
  await svc.adminDisconnect('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(8).args[1].includes('workspaceId=ws1'), 'adminDisconnect threads ws')
  await svc.adminAudit({ workspaceId: 'ws1' })
  t.ok(stub.getCall(9).args[1].includes('workspaceId=ws1'), 'adminAudit threads ws')
  sandbox.restore()
  t.end()
})

test('the list reads workspaceId from the filter bag OR the options bag', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listAccounts({}, { workspaceId: 'ws2' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws2'), 'accounts: options bag')
  await svc.listAccounts({ workspaceId: 'ws1' }, { workspaceId: 'ws2' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'accounts: the filter bag wins')
  await svc.adminListAccounts({}, { workspaceId: 'ws2' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws2'), 'admin: options bag')
  await svc.adminAudit({}, { workspaceId: 'ws2' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws2'), 'audit: options bag')
  sandbox.restore()
  t.end()
})

// ─── Envelope handling through the real _call → _request path ────────────────

test('a bare payload passes through and the URL carries the /core prefix', async t => {
  t.plan(3)
  const svc = makeFetchService()
  const fetchStub = sandbox
    .stub(globalThis, 'fetch')
    .resolves(fakeResponse(200, [{ id: 'a1', address: 'a@x.co' }]))
  const rows = await svc.listAccounts({ workspaceId: 'ws1' })
  t.equal(
    fetchStub.firstCall.args[0],
    'https://api.test/core/mail/accounts?workspaceId=ws1',
    'full URL'
  )
  t.equal(fetchStub.firstCall.args[1].method, 'GET', 'GET')
  t.deepEqual(rows, [{ id: 'a1', address: 'a@x.co' }], 'the bare array is returned unchanged')
  sandbox.restore()
  t.end()
})

test('an enveloped { success, data } response is unwrapped', async t => {
  t.plan(1)
  const svc = makeFetchService()
  sandbox
    .stub(globalThis, 'fetch')
    .resolves(fakeResponse(200, { success: true, data: { state: 'ready' } }))
  const setup = await svc.getSetup({ workspaceId: 'ws1' })
  t.deepEqual(setup, { state: 'ready' }, 'the data field is unwrapped')
  sandbox.restore()
  t.end()
})

test('a { success: false } envelope throws its message', async t => {
  t.plan(1)
  const svc = makeFetchService()
  sandbox
    .stub(globalThis, 'fetch')
    .resolves(fakeResponse(200, { success: false, message: 'mail is off for this workspace' }))
  try {
    await svc.getSetup({ workspaceId: 'ws1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'mail is off for this workspace', 'the envelope message surfaces')
  }
  sandbox.restore()
  t.end()
})

// ─── The error contracts the server answers today ────────────────────────────

test('setupLink surfaces the 409 directory_mismatch with expectedAddress; 200 linked passes through', async t => {
  t.plan(5)
  const svc = makeFetchService()
  const fetchStub = sandbox.stub(globalThis, 'fetch')
  fetchStub.onCall(0).resolves(
    fakeResponse(409, { error: 'directory_mismatch', message: 'the directory has no mailbox for this member', expectedAddress: 'nika@symbols.app' })
  )
  fetchStub.onCall(1).resolves(
    fakeResponse(200, { linked: true, created: true, account: { id: 'a1', address: 'nika@symbols.app', kind: 'tenant', status: 'active', canSend: true } })
  )
  try {
    await svc.setupLink({ workspaceId: 'ws1' })
    t.fail('should have thrown on 409')
  } catch (err) {
    t.equal(err.status, 409, 'status rides on the error')
    t.equal(err.cause.error, 'directory_mismatch', 'the machine code rides on cause')
    t.equal(err.cause.expectedAddress, 'nika@symbols.app', 'the address the directory expects rides on cause')
  }
  const ok = await svc.setupLink({ workspaceId: 'ws1' })
  t.equal(ok.linked, true, 'linked')
  t.equal(ok.account.kind, 'tenant', 'a tenant mailbox')
  sandbox.restore()
  t.end()
})

test('setupNotifyAdmin surfaces the 429 with its retryAt stamp', async t => {
  t.plan(3)
  const svc = makeFetchService()
  sandbox.stub(globalThis, 'fetch').resolves(
    fakeResponse(429, {
      error: 'already_notified',
      message: 'an admin was notified in the last 24 hours',
      retryAt: '2026-09-06T10:00:00.000Z'
    })
  )
  try {
    await svc.setupNotifyAdmin({ workspaceId: 'ws1' })
    t.fail('should have thrown — one notification per viewer per day')
  } catch (err) {
    t.equal(err.status, 429, 'status 429')
    t.equal(err.cause.error, 'already_notified', 'the rate-limit code rides on cause')
    t.equal(err.cause.retryAt, '2026-09-06T10:00:00.000Z', 'retryAt rides on cause')
  }
  sandbox.restore()
  t.end()
})

test('an account the viewer may not see answers 404, never 403', async t => {
  t.plan(2)
  const svc = makeFetchService()
  sandbox
    .stub(globalThis, 'fetch')
    .resolves(fakeResponse(404, { error: 'not_found', message: 'mail account not found' }))
  try {
    await svc.getAccount('a1', { workspaceId: 'ws1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 404, '404 — the ACL miss and the missing row are the same answer')
    t.equal(err.message, 'mail account not found', 'message')
  }
  sandbox.restore()
  t.end()
})

// ─── Send path (§5.7, MAIL-SERVER-SEND-OUTBOX-1) ─────────────────────────────

test('mail.createDraft POSTs the body to /mail/drafts with the workspace pin', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'd1' })
  await svc.createDraft({ account: 'a1', to: [{ email: 'x@y.co' }], subject: 'Hi' }, { workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[0], 'mail.createDraft', 'name')
  t.equal(stub.firstCall.args[1], '/mail/drafts?workspaceId=ws1', 'path + pin')
  t.equal(stub.firstCall.args[2].method, 'POST', 'verb')
  t.deepEqual(stub.firstCall.args[2].body.to, [{ email: 'x@y.co' }], 'body intact')
  sandbox.restore()
  t.end()
})

test('mail.updateDraft PATCHes /mail/drafts/:id; deleteDraft DELETEs it', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.updateDraft('d1', { subject: 'x' }, { workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[1], '/mail/drafts/d1?workspaceId=ws1', 'update path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'update verb')
  await svc.deleteDraft('d1', { workspaceId: 'ws1' })
  t.equal(stub.secondCall.args[1], '/mail/drafts/d1?workspaceId=ws1', 'delete path')
  t.equal(stub.secondCall.args[2].method, 'DELETE', 'delete verb')
  sandbox.restore()
  t.end()
})

test('mail.uploadDraftAttachment sends FormData with a `file` part', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const blob = new Blob(['bytes'], { type: 'text/plain' })
  await svc.uploadDraftAttachment('d1', blob, { workspaceId: 'ws1', filename: 'a.txt' })
  t.equal(stub.firstCall.args[1], '/mail/drafts/d1/attachments?workspaceId=ws1', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'verb')
  t.ok(stub.firstCall.args[2].body instanceof FormData, 'FormData body — Content-Type left to the runtime')
  t.ok(stub.firstCall.args[2].body.get('file'), 'the file part is set')
  sandbox.restore()
  t.end()
})

test('mail.send POSTs { draftId, … } to /mail/send; listOutbox threads status+limit; cancelSend POSTs the cancel', async t => {
  t.plan(6)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.send({ draftId: 'd1', undoSeconds: 10 }, { workspaceId: 'ws1' })
  t.equal(stub.firstCall.args[1], '/mail/send?workspaceId=ws1', 'send path')
  t.deepEqual(stub.firstCall.args[2].body, { draftId: 'd1', undoSeconds: 10 }, 'send body')
  await svc.listOutbox({ workspaceId: 'ws1', status: 'queued', limit: 5 })
  t.equal(stub.secondCall.args[1], '/mail/outbox?status=queued&limit=5&workspaceId=ws1', 'outbox query')
  t.equal(stub.secondCall.args[2], undefined, 'outbox GET — no options')
  await svc.cancelSend('o1', { workspaceId: 'ws1' })
  t.equal(stub.thirdCall.args[1], '/mail/outbox/o1/cancel?workspaceId=ws1', 'cancel path')
  t.equal(stub.thirdCall.args[2].method, 'POST', 'cancel verb')
  sandbox.restore()
  t.end()
})

test('a 409 not_cancellable ride: rowStatus reaches the caller via cause', async t => {
  t.plan(2)
  const svc = makeFetchService()
  sandbox
    .stub(globalThis, 'fetch')
    .resolves(fakeResponse(409, { error: 'not_cancellable', message: 'outbox row is sent', rowStatus: 'sent' }))
  try {
    await svc.cancelSend('o1', { workspaceId: 'ws1' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 409, '409 once the worker claimed the row')
    t.equal(err.cause.rowStatus, 'sent', 'rowStatus rides on cause')
  }
  sandbox.restore()
  t.end()
})

// ─── subscribeStream (§5.9, MAIL-SERVER-STREAM-RELAY-1) ──────────────────────

test('mail.subscribeStream calls _sseSubscribe with /mail/stream, flat workspaceId, unsub passthrough', t => {
  t.plan(5)
  const svc = makeService()
  const cb = () => {}
  const unsubMock = () => {}
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(unsubMock)
  const unsub = svc.subscribeStream({ workspaceId: 'ws1' }, cb)
  t.equal(stub.calledOnce, true, '_sseSubscribe called once')
  t.equal(stub.firstCall.args[0], '/mail/stream', 'path')
  t.deepEqual(stub.firstCall.args[1], { workspaceId: 'ws1' }, 'workspaceId threaded in the filter')
  t.equal(stub.firstCall.args[3].flatParams, true, 'FLAT params — the member chain reads ?workspaceId=, not filter[workspaceId]')
  t.equal(unsub, unsubMock, 'returns the unsubscribe fn from _sseSubscribe')
  sandbox.restore()
  t.end()
})

// The DocService lesson (2026-08-09) pinned here from birth: an SSE wrapper
// that omits `events` inherits the tickets.* default vocabulary — names the
// mail stream never emits — and onEvent silently never fires. Pin the REAL
// §5.9 names MailStreamController writeEvent()s.
test('mail.subscribeStream wires the REAL mail.* server event names, not the tickets.* default', t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  svc.subscribeStream({}, () => {})
  const opts = stub.firstCall.args[3]
  const names = opts.events.map((e) => e.name)
  t.deepEqual(
    names,
    ['mail.snapshot', 'mail.thread.upsert', 'mail.thread.delete', 'mail.account.status', 'mail.account.progress', 'mail.outbox.sent', 'mail.outbox.failed', 'mail.unread'],
    'listens for the mail.* names MailStreamController actually writeEvent()s'
  )
  t.equal(names.includes('tickets.snapshot'), false, 'does NOT listen for the tickets.* default')
  t.deepEqual(
    opts.events[0].frame({ accounts: [], unread: [] }),
    { type: 'mail.snapshot', accounts: [], unread: [] },
    'frame merges the SSE data under the event type'
  )
  t.deepEqual(stub.firstCall.args[1], {}, 'no workspaceId → empty filter (server falls back to the active-workspace claim)')
  sandbox.restore()
  t.end()
})

// ─── Read path (MAIL-SERVER-THREAD-READ-ROUTES-1, §5.2 threads · §5.6 bodies) ──

test('mail.listThreads GETs /mail/threads with the filter keys as query params, limit/cursor from either bag', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ rows: [], cursor: null, exhausted: true })
  await svc.listThreads({ workspaceId: 'ws1', folder: 'inbox', unread: true, accountId: 'all', from: 'ana', q: 'invoice' }, { limit: 50, cursor: 'c1' })
  t.equal(stub.firstCall.args[0], 'mail.listThreads', 'name')
  const url = new URL(`https://x${stub.firstCall.args[1]}`)
  t.equal(url.pathname, '/mail/threads', 'path')
  t.deepEqual(
    Object.fromEntries(url.searchParams),
    { accountId: 'all', folder: 'inbox', unread: 'true', from: 'ana', q: 'invoice', cursor: 'c1', limit: '50', workspaceId: 'ws1' },
    'every filter + the hoisted limit/cursor + the workspace pin'
  )
  t.equal(stub.firstCall.args[2], undefined, 'GET — no options')
  await svc.listThreads({}, {})
  t.equal(stub.secondCall.args[1], '/mail/threads', 'empty filter → bare collection (no dangling ?)')
  sandbox.restore()
  t.end()
})

test('mail.getThread / updateThread / batchThreads hit the thread routes with the right verbs and bodies', async t => {
  t.plan(9)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getThread('t/1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'mail.getThread', 'get name')
  t.equal(stub.getCall(0).args[1], '/mail/threads/t%2F1?workspaceId=ws1', 'encoded id + pin')
  t.equal(stub.getCall(0).args[2], undefined, 'GET')
  await svc.updateThread('t1', { read: true, folder: 'archive' }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[0], 'mail.updateThread', 'update name')
  t.equal(stub.getCall(1).args[1], '/mail/threads/t1?workspaceId=ws1', 'update path')
  t.deepEqual(stub.getCall(1).args[2], { method: 'PATCH', body: { read: true, folder: 'archive' } }, 'PATCH with the flag body')
  await svc.batchThreads({ ids: ['t1', 't2'], starred: true }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(2).args[0], 'mail.batchThreads', 'batch name')
  t.equal(stub.getCall(2).args[1], '/mail/threads/batch?workspaceId=ws1', 'batch path')
  t.deepEqual(stub.getCall(2).args[2], { method: 'POST', body: { ids: ['t1', 't2'], starred: true } }, 'POST with ids + flags')
  sandbox.restore()
  t.end()
})

test('mail.getBody GETs /mail/messages/:id/body; attachmentUrl re-bases the server path on this client\'s API origin', async t => {
  t.plan(7)
  const svc = makeService()
  svc._apiUrl = 'https://api.local'
  const stub = sandbox.stub(svc, '_call')
  stub.onCall(0).resolves({ html: '<p>x</p>', text: 'x', blockedImages: 1 })
  stub.onCall(1).resolves({
    url: 'https://dev.api.symbols.app/core/mail/messages/m1/attachments/A1/content?sig=tok',
    path: '/core/mail/messages/m1/attachments/A1/content?sig=tok',
    expiresAt: '2026-09-06T12:10:00.000Z',
    filename: 'a.pdf',
    mime: 'application/pdf',
    size: 3,
    inline: false
  })
  const body = await svc.getBody('m1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'mail.getBody', 'body name')
  t.equal(stub.getCall(0).args[1], '/mail/messages/m1/body?workspaceId=ws1', 'body path')
  t.equal(body.blockedImages, 1, 'the sanitised answer passes through untouched')
  const att = await svc.attachmentUrl('m1', 'A/1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[0], 'mail.attachmentUrl', 'attachment name')
  t.equal(stub.getCall(1).args[1], '/mail/messages/m1/attachments/A%2F1?workspaceId=ws1', 'encoded aid + pin')
  t.equal(att.url, 'https://api.local/core/mail/messages/m1/attachments/A1/content?sig=tok', 'url re-based on _apiUrl + the server path')
  t.equal(att.filename, 'a.pdf', 'the rest of the answer is kept')
  sandbox.restore()
  t.end()
})

test('mail.attachmentUrl keeps the server url when this client has no API base', async t => {
  t.plan(1)
  const svc = makeService()
  svc._apiUrl = null
  sandbox.stub(svc, '_call').resolves({ url: 'https://dev.api.symbols.app/x?sig=t', path: '/x?sig=t' })
  const att = await svc.attachmentUrl('m1', 'A1')
  t.equal(att.url, 'https://dev.api.symbols.app/x?sig=t', 'fallback: the server\'s absolute url')
  sandbox.restore()
  t.end()
})

test('a 404 from getThread reads as "not visible to you" — a thrown Error, never a 403 leak', async t => {
  t.plan(2)
  const svc = makeFetchService()
  sandbox.stub(globalThis, 'fetch').resolves(fakeResponse(404, { error: 'not_found', message: 'mail thread not found' }))
  try {
    await svc.getThread('t1', { workspaceId: 'ws1' })
    t.fail('should throw')
  } catch (err) {
    t.ok(err instanceof Error, 'throws')
    t.equal(err.status, 404, 'the 404 status rides the error')
  }
  sandbox.restore()
  t.end()
})
