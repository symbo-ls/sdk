import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for "workspace-scoping gaps in the chat transport"
// (tickets/sdk.md, 2026-07-13) items 2+3 — the workspaceProject.chat*
// argMaps thread an optional workspaceId through to WorkspaceProjectService,
// and preserve the historical "no channelId ⇒ bulk workspace-wide read"
// behavior for declarative fetch: consumers by setting `bulk: true`
// explicitly, so the service-layer "no silent escalation" guard doesn't
// break existing callers routed through sdk.execute(...).
//
// The real WorkspaceProjectService nests chat methods under `.chat.*`
// (dotted route methodPath), so the mock needs actual nested objects — a
// flat single-level Proxy (as used by the flat-method registry tests)
// can't resolve `chat.listChannels`.
const spy = (calls, service, method) => (...args) => {
  calls.push({ service, method, args })
  return Promise.resolve({ ok: true })
}

const makeSdk = (calls) => {
  const workspaceProject = {
    chat: {
      listChannels: spy(calls, 'workspaceProject', 'chat.listChannels'),
      listMembers: spy(calls, 'workspaceProject', 'chat.listMembers'),
      listMessages: spy(calls, 'workspaceProject', 'chat.listMessages'),
      listMentions: spy(calls, 'workspaceProject', 'chat.listMentions'),
      searchMessages: spy(calls, 'workspaceProject', 'chat.searchMessages'),
    }
  }
  return { getService: (name) => (name === 'workspaceProject' ? workspaceProject : {}) }
}

test('workspaceProject.chat list threads workspaceId positionally', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat', 'list', { workspaceId: 'ws1' })
  t.deepEqual(calls[0], { service: 'workspaceProject', method: 'chat.listChannels', args: ['ws1'] })
  t.end()
})

test('workspaceProject.chat list with no args (back-compat: chat page cold load)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat', 'list', {})
  t.deepEqual(calls[0], { service: 'workspaceProject', method: 'chat.listChannels', args: [undefined] })
  t.end()
})

test('workspaceProject.chat.members list — no channelId sets bulk:true (back-compat)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  // Exact shape of `.execute('workspaceProject.chat.members', 'list')` used
  // by workspace/packages/workspace/functions/loadPrivateData.js and
  // workspace/packages/tickets/components/TicketDetailModal.js.
  await execute('workspaceProject.chat.members', 'list', undefined)
  t.deepEqual(calls[0], {
    service: 'workspaceProject',
    method: 'chat.listMembers',
    args: [undefined, { bulk: true, workspaceId: undefined }]
  })
  t.end()
})

test('workspaceProject.chat.members list — channelId present sets bulk:false', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.members', 'list', { channelId: 'c1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'workspaceProject',
    method: 'chat.listMembers',
    args: ['c1', { bulk: false, workspaceId: 'ws1' }]
  })
  t.end()
})

test('workspaceProject.chat.messages list — no channelId sets bulk:true (back-compat: /chat page 500-row load)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  // Exact shape used by workspace/packages/workspace/functions/loadPrivateData.js:922
  // and the chat page's declarative fetch: (via the sdk adapter's _packSelect).
  await execute('workspaceProject.chat.messages', 'list', {
    options: { limit: 500, order: 'created_at', ascending: false }
  })
  t.equal(calls[0].method, 'chat.listMessages')
  t.equal(calls[0].args[0], undefined, 'no channelId')
  t.deepEqual(calls[0].args[1], {
    single: undefined, limit: 500, offset: undefined, order: 'created_at',
    ascending: false,
    bulk: true,
    workspaceId: undefined
  })
  t.end()
})

test('workspaceProject.chat.messages list — channelId present sets bulk:false and threads workspaceId', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.messages', 'list', { channelId: 'c1', workspaceId: 'ws1', limit: 1 })
  t.equal(calls[0].args[0], 'c1')
  t.equal(calls[0].args[1].bulk, false)
  t.equal(calls[0].args[1].workspaceId, 'ws1')
  t.equal(calls[0].args[1].limit, 1)
  t.end()
})

test('workspaceProject.chat.mentions list threads workspaceId into options', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.mentions', 'list', { workspaceId: 'ws1', order: 'created_at' })
  t.equal(calls[0].method, 'chat.listMentions')
  t.equal(calls[0].args[1].workspaceId, 'ws1')
  t.equal(calls[0].args[1].order, 'created_at')
  t.end()
})

test('workspaceProject.chat.search rpc threads workspaceId as the 3rd positional arg', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.chat.search', 'rpc', { q: 'hi', callerEmail: 'a@b.com', workspaceId: 'ws1' })
  t.deepEqual(calls[0], {
    service: 'workspaceProject',
    method: 'chat.searchMessages',
    args: ['hi', 'a@b.com', 'ws1']
  })
  t.end()
})
