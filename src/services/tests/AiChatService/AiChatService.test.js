import test from 'tape'
import sinon from 'sinon'
import { AiChatService } from '../../AiChatService.js'

// Per-workspace tenant threading for aiChat (mirrors the chat transport
// work shipped in sdk@5a8d798 — "workspace-scoping gaps in the chat
// transport"). aiChat is being made WORKSPACE-scoped server-side (a
// `workspace` field + resolveWorkspaceId resolver); these tests cover the
// SDK side: every aiChat call now SENDS the tenant (workspaceId as the new
// primary key, orgId kept for back-compat) instead of relying solely on the
// server's req.user.activeOrganization inference, which races
// switchOrg/switchWorkspace.

const sandbox = sinon.createSandbox()

const makeService = (context) => {
  const svc = new AiChatService()
  svc._context = context || {}
  return svc
}

test.onFinish(() => sandbox.restore())

// ── _aiChatScope ─────────────────────────────────────────────────────────

test('_aiChatScope defaults orgId/workspaceId from _context when omitted', t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  t.deepEqual(svc._aiChatScope({}), { orgId: 'org-ctx', workspaceId: 'ws-ctx' })
  t.end()
})

test('_aiChatScope — explicit values win over context', t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  t.deepEqual(
    svc._aiChatScope({ orgId: 'org-explicit', workspaceId: 'ws-explicit' }),
    { orgId: 'org-explicit', workspaceId: 'ws-explicit' }
  )
  t.end()
})

test('_aiChatScope — no context anywhere resolves to undefined (back-compat)', t => {
  t.plan(1)
  const svc = makeService()
  t.deepEqual(svc._aiChatScope({}), { orgId: undefined, workspaceId: undefined })
  t.end()
})

// ── threads.list ────────────────────────────────────────────────────────

test('threads.list composes orgId + workspaceId + includeArchived into the query', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.threads.list({ includeArchived: true })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads?includeArchived=true&orgId=org-ctx&workspaceId=ws-ctx',
    'query composed from context defaults'
  )
  sandbox.restore()
})

test('threads.list — explicit orgId/workspaceId override context', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.threads.list({ orgId: 'org-explicit', workspaceId: 'ws-explicit' })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads?orgId=org-explicit&workspaceId=ws-explicit',
    'explicit args win over context'
  )
  sandbox.restore()
})

test('threads.list — no scope anywhere → bare endpoint (back-compat)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.threads.list()
  t.equal(stub.firstCall.args[1], '/ai-chat/threads', 'byte-identical to pre-scoping behavior')
  sandbox.restore()
})

// ── threads.get ─────────────────────────────────────────────────────────

test('threads.get appends orgId + workspaceId from context', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.threads.get('thread-1')
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads/thread-1?orgId=org-ctx&workspaceId=ws-ctx',
    'scope appended from context'
  )
  sandbox.restore()
})

test('threads.get — no scope anywhere → bare endpoint (back-compat)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.threads.get('thread-1')
  t.equal(stub.firstCall.args[1], '/ai-chat/threads/thread-1', 'byte-identical to pre-scoping behavior')
  sandbox.restore()
})

test('threads.get encodes special chars in threadId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.threads.get('foo/bar')
  t.equal(stub.firstCall.args[1], '/ai-chat/threads/foo%2Fbar', 'encoded path')
  sandbox.restore()
})

// ── threads.create ──────────────────────────────────────────────────────

test('threads.create sends orgId + workspaceId as query params (not folded into body)', async t => {
  t.plan(2)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.threads.create({ title: 'New thread' })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads?orgId=org-ctx&workspaceId=ws-ctx',
    'scope in the URL from context defaults'
  )
  t.deepEqual(stub.firstCall.args[2].body, { payload: { title: 'New thread' } }, 'body unchanged')
  sandbox.restore()
})

test('threads.create — explicit scope overrides context', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.threads.create({ title: 'New thread' }, { orgId: 'org-explicit', workspaceId: 'ws-explicit' })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads?orgId=org-explicit&workspaceId=ws-explicit',
    'explicit scope wins'
  )
  sandbox.restore()
})

test('threads.create — no scope anywhere → bare endpoint (back-compat)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'new' })
  await svc.threads.create({ title: 'New thread' })
  t.equal(stub.firstCall.args[1], '/ai-chat/threads', 'byte-identical to pre-scoping behavior')
  t.deepEqual(stub.firstCall.args[2].body, { payload: { title: 'New thread' } }, 'body unchanged')
  sandbox.restore()
})

// ── messages.list ────────────────────────────────────────────────────────

test('messages.list composes limit + beforeId + orgId + workspaceId', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.messages.list('thread-1', { limit: 50, beforeId: 'msg-9' })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads/thread-1/messages?limit=50&beforeId=msg-9&orgId=org-ctx&workspaceId=ws-ctx',
    'full query composed'
  )
  sandbox.restore()
})

test('messages.list — explicit workspaceId/orgId override context', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.messages.list('thread-1', { orgId: 'org-explicit', workspaceId: 'ws-explicit' })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads/thread-1/messages?orgId=org-explicit&workspaceId=ws-explicit',
    'explicit scope wins'
  )
  sandbox.restore()
})

test('messages.list — no scope anywhere → byte-identical to pre-scoping behavior', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.messages.list('thread-1', { limit: 200 })
  t.equal(
    stub.firstCall.args[1],
    '/ai-chat/threads/thread-1/messages?limit=200',
    'byte-identical to pre-scoping behavior'
  )
  sandbox.restore()
})

// ── completion ───────────────────────────────────────────────────────────

test('completion folds orgId + workspaceId from _context into the POSTed payload', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({ text: 'hi' })
  await svc.completion({ threadId: 't1', content: 'hello' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { threadId: 't1', content: 'hello', orgId: 'org-ctx', workspaceId: 'ws-ctx' } },
    'scope folded into payload'
  )
  sandbox.restore()
})

test('completion — explicit payload.orgId/workspaceId override context', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({ text: 'hi' })
  await svc.completion({ threadId: 't1', orgId: 'org-explicit', workspaceId: 'ws-explicit' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { threadId: 't1', orgId: 'org-explicit', workspaceId: 'ws-explicit' } },
    'explicit payload scope wins'
  )
  sandbox.restore()
})

test('completion — no scope anywhere → payload unchanged (back-compat)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ text: 'hi' })
  await svc.completion({ threadId: 't1', content: 'hello' })
  t.deepEqual(
    stub.firstCall.args[2].body,
    { payload: { threadId: 't1', content: 'hello' } },
    'byte-identical to pre-scoping behavior'
  )
  sandbox.restore()
})

// ── stream ───────────────────────────────────────────────────────────────

test('stream folds orgId + workspaceId from _context into the POSTed payload', t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_streamPost').returns(() => {})
  svc.stream({ threadId: 't1', content: 'hello' }, {})
  t.deepEqual(
    stub.firstCall.args[1],
    { payload: { threadId: 't1', content: 'hello', orgId: 'org-ctx', workspaceId: 'ws-ctx' } },
    'scope folded into payload'
  )
  sandbox.restore()
  t.end()
})

test('stream — no scope anywhere → payload unchanged (back-compat)', t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_streamPost').returns(() => {})
  svc.stream({ threadId: 't1', content: 'hello' }, {})
  t.equal(stub.firstCall.args[0], '/ai-chat/stream', 'path unchanged')
  t.deepEqual(
    stub.firstCall.args[1],
    { payload: { threadId: 't1', content: 'hello' } },
    'byte-identical to pre-scoping behavior'
  )
  sandbox.restore()
  t.end()
})

// ── meetAnalyze — untouched (roomId-scoped server-side) ───────────────────

test('meetAnalyze is untouched by tenant threading', async t => {
  t.plan(1)
  const svc = makeService({ activeOrgId: 'org-ctx', activeWorkspaceId: 'ws-ctx' })
  const stub = sandbox.stub(svc, '_call').resolves({ pending: true })
  await svc.meetAnalyze({ roomId: 'room-1' })
  t.deepEqual(stub.firstCall.args[2].body, { payload: { roomId: 'room-1' } }, 'no scope folded in')
  sandbox.restore()
})
