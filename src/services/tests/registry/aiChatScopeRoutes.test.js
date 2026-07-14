import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for aiChat per-workspace tenant threading
// (mirrors "workspace-scoping gaps in the chat transport", sdk@5a8d798,
// applied to aiChat.*). The aiChat.threads/messages argMaps thread an
// optional orgId/workspaceId through to AiChatService, which defaults from
// _context.activeOrgId/activeWorkspaceId (see AiChatService._aiChatScope)
// — so a caller that never supplies them dispatches byte-identical args to
// the pre-scoping behavior.
//
// AiChatService nests threads/messages under `.threads.*` / `.messages.*`
// (dotted route methodPath), so the mock needs actual nested objects.
const spy = (calls, service, method) => (...args) => {
  calls.push({ service, method, args })
  return Promise.resolve({ ok: true })
}

const makeSdk = (calls) => {
  const aiChat = {
    threads: {
      list: spy(calls, 'aiChat', 'threads.list'),
      get: spy(calls, 'aiChat', 'threads.get'),
      create: spy(calls, 'aiChat', 'threads.create'),
      remove: spy(calls, 'aiChat', 'threads.remove'),
    },
    messages: {
      list: spy(calls, 'aiChat', 'messages.list'),
    },
  }
  return { getService: (name) => (name === 'aiChat' ? aiChat : {}) }
}

// ── aiChat.threads.list ─────────────────────────────────────────────────

test('aiChat.threads list threads orgId + workspaceId through', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'list', { orgId: 'org1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.list',
    args: [{ includeArchived: false, orgId: 'org1', workspaceId: 'ws1' }]
  })
  t.end()
})

test('aiChat.threads list with no args (back-compat)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'list', {})
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.list',
    args: [{ includeArchived: false, orgId: undefined, workspaceId: undefined }]
  })
  t.end()
})

// ── aiChat.threads.get ──────────────────────────────────────────────────

test('aiChat.threads get threads orgId + workspaceId through', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'get', { id: 'thread-1', orgId: 'org1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.get',
    args: ['thread-1', { orgId: 'org1', workspaceId: 'ws1' }]
  })
  t.end()
})

test('aiChat.threads get — no scope (back-compat)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'get', { id: 'thread-1' })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.get',
    args: ['thread-1', { orgId: undefined, workspaceId: undefined }]
  })
  t.end()
})

// ── aiChat.threads.create ───────────────────────────────────────────────

test('aiChat.threads create threads orgId + workspaceId through', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'create', { payload: { title: 'New thread' }, orgId: 'org1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.create',
    args: [{ title: 'New thread' }, { orgId: 'org1', workspaceId: 'ws1' }]
  })
  t.end()
})

test('aiChat.threads create — no scope (back-compat)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'create', { payload: { title: 'New thread' } })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'threads.create',
    args: [{ title: 'New thread' }, { orgId: undefined, workspaceId: undefined }]
  })
  t.end()
})

// ── aiChat.threads.remove — unchanged ───────────────────────────────────

test('aiChat.threads remove is unchanged by tenant threading', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.threads', 'remove', { id: 'thread-1' })
  t.deepEqual(calls[0], { service: 'aiChat', method: 'threads.remove', args: ['thread-1'] })
  t.end()
})

// ── aiChat.messages.list ────────────────────────────────────────────────

test('aiChat.messages list threads orgId + workspaceId through', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('aiChat.messages', 'list', { threadId: 't1', limit: 50, orgId: 'org1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'messages.list',
    args: ['t1', { limit: 50, beforeId: undefined, orgId: 'org1', workspaceId: 'ws1' }]
  })
  t.end()
})

test('aiChat.messages list — no scope (back-compat: existing aiAssistantThreads.js call shape)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  // Exact shape used by workspace/packages/workspace/functions/aiAssistantThreads.js
  // via sdk.aiChat.messages.list directly — but also verifies the dispatch
  // route (declarative fetch: consumers) stays byte-identical.
  await execute('aiChat.messages', 'list', { threadId: 't1', limit: 200 })
  t.deepEqual(calls[0], {
    service: 'aiChat',
    method: 'messages.list',
    args: ['t1', { limit: 200, beforeId: undefined, orgId: undefined, workspaceId: undefined }]
  })
  t.end()
})
