import test from 'tape'
import sinon from 'sinon'
import { ChannelService } from '../../ChannelService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new ChannelService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('channels: account paths, methods and bodies', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.listAccounts({ channel: 'whatsapp', status: 'active' }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'channels.listAccounts')
  t.equal(stub.getCall(0).args[1], '/channels/accounts?channel=whatsapp&status=active&workspaceId=ws1')
  await svc.getAccount('a1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[1], '/channels/accounts/a1?workspaceId=ws1')
  const payload = { provider: 'meta_cloud', mode: 'simulated', name: 'WA', address: '+995322000101' }
  await svc.createAccount(payload, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(2).args.slice(1), ['/channels/accounts?workspaceId=ws1', { method: 'POST', body: payload }])
  await svc.updateAccount('a1', { status: 'paused' })
  t.deepEqual(stub.getCall(3).args.slice(1), ['/channels/accounts/a1', { method: 'PATCH', body: { status: 'paused' } }])
  await svc.disconnectAccount('a1', { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(4).args.slice(1), ['/channels/accounts/a1?workspaceId=ws1', { method: 'DELETE' }])
  await svc.rotateVerifyToken('a1')
  t.deepEqual(stub.getCall(5).args.slice(1), ['/channels/accounts/a1/verify-token', { method: 'POST', body: {} }])
  await svc.listTemplates('a1')
  t.equal(stub.getCall(6).args[1], '/channels/accounts/a1/templates')
  await svc.syncTemplates('a1')
  t.deepEqual(stub.getCall(7).args.slice(1), ['/channels/accounts/a1/templates/sync', { method: 'POST', body: {} }])
  await svc.simulate('a1', { type: 'message', from: '+995599123456', text: 'hi' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(8).args.slice(1), [
    '/channels/accounts/a1/simulate?workspaceId=ws1',
    { method: 'POST', body: { type: 'message', from: '+995599123456', text: 'hi' } }
  ])
  await svc.getAccount('a/b')
  t.equal(stub.getCall(9).args[1], '/channels/accounts/a%2Fb', 'ids are encoded')
  sandbox.restore()
  t.end()
})

test('channels: send, click-to-call, outcome, simulated call, read', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const msg = { channel: 'whatsapp', partyId: 'p1', text: 'Hello' }
  await svc.send(msg, { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'channels.send')
  t.deepEqual(stub.getCall(0).args.slice(1), ['/channels/messages?workspaceId=ws1', { method: 'POST', body: msg }])
  await svc.startCall({ partyId: 'p1', memberPhone: '+995555000111' })
  t.deepEqual(stub.getCall(1).args.slice(1), [
    '/channels/calls',
    { method: 'POST', body: { partyId: 'p1', memberPhone: '+995555000111' } }
  ])
  await svc.logCallOutcome('m1', { outcome: 'interested', note: 'Friday' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(2).args.slice(1), [
    '/channels/calls/m1?workspaceId=ws1',
    { method: 'PATCH', body: { outcome: 'interested', note: 'Friday' } }
  ])
  await svc.simulateCall('m1', { status: 'completed', durationSec: 42 })
  t.deepEqual(stub.getCall(3).args.slice(1), [
    '/channels/calls/m1/simulate',
    { method: 'POST', body: { status: 'completed', durationSec: 42 } }
  ])
  await svc.markRead('c1', { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(4).args.slice(1), ['/channels/conversations/c1/read?workspaceId=ws1', { method: 'POST', body: {} }])
  sandbox.restore()
  t.end()
})

test('channels.inbox / timeline return rows with pagination attached; filters are whitelisted', async t => {
  const svc = makeService()
  const call = sandbox.stub(svc, '_call')
  call.onCall(0).resolves({ success: true, data: [{ id: 'c1', unreadCount: 2 }], pagination: { totalCount: 1, hasMore: false } })
  call.onCall(1).resolves({ success: true, data: [{ id: 'm1', kind: 'call' }], pagination: { hasMore: true, nextBefore: '2026-09-29T10:00:00.000Z' } })
  const inbox = await svc.inbox({ channel: ['whatsapp', 'sms'], assignee: 'me', unread: true, bogus: 'x' }, { limit: 20, workspaceId: 'ws1' })
  const url = call.getCall(0).args[1]
  t.equal(call.getCall(0).args[0], 'channels.inbox')
  t.ok(url.startsWith('/channels/inbox?'))
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.equal(q.get('channel'), 'whatsapp,sms')
  t.equal(q.get('assignee'), 'me')
  t.equal(q.get('unread'), 'true')
  t.equal(q.get('limit'), '20')
  t.equal(q.get('workspaceId'), 'ws1')
  t.equal(q.get('bogus'), null, 'unknown filters are not sent')
  t.deepEqual(call.getCall(0).args[2], { raw: true })
  t.equal(inbox.length, 1)
  t.deepEqual(inbox.pagination, { totalCount: 1, hasMore: false })

  const tl = await svc.timeline({ regardingType: 'deal', regardingId: 'd1', before: new Date('2026-09-29T11:00:00.000Z') }, { limit: 50 })
  const u2 = call.getCall(1).args[1]
  t.ok(u2.startsWith('/channels/timeline?'))
  const q2 = new URLSearchParams(u2.slice(u2.indexOf('?') + 1))
  t.equal(q2.get('regardingType'), 'deal')
  t.equal(q2.get('regardingId'), 'd1')
  t.equal(q2.get('before'), '2026-09-29T11:00:00.000Z', 'a Date goes out as ISO')
  t.equal(tl[0].kind, 'call')
  t.equal(tl.pagination.nextBefore, '2026-09-29T10:00:00.000Z')
  sandbox.restore()
  t.end()
})

test('sdk.execute routes: channels.accounts / .inbox / .timeline / .messages / .calls / .conversations', async t => {
  const calls = []
  const svc = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'channels' ? svc : null) })
  await dispatch('channels.accounts', 'list', { channel: 'whatsapp', workspaceId: 'ws1' })
  t.equal(calls[0][0], 'listAccounts')
  t.equal(calls[0][1].channel, 'whatsapp')
  t.equal(calls[0][2].workspaceId, 'ws1')
  await dispatch('channels.accounts', 'create', { provider: 'meta_cloud', mode: 'simulated', name: 'WA', address: '+995322000101', workspaceId: 'ws1' })
  t.deepEqual(calls[1], ['createAccount', { provider: 'meta_cloud', mode: 'simulated', name: 'WA', address: '+995322000101' }, { workspaceId: 'ws1' }], 'workspaceId never rides the body')
  await dispatch('channels.accounts', 'update', { id: 'a1', status: 'paused', workspaceId: 'ws1' })
  t.deepEqual(calls[2], ['updateAccount', 'a1', { status: 'paused' }, { workspaceId: 'ws1' }])
  await dispatch('channels.accounts', 'remove', { id: 'a1', workspaceId: 'ws1' })
  t.deepEqual(calls[3], ['disconnectAccount', 'a1', { workspaceId: 'ws1' }], 'remove disconnects')
  await dispatch('channels.accounts', 'templates', { id: 'a1', workspaceId: 'ws1' })
  t.deepEqual(calls[4], ['listTemplates', 'a1', { workspaceId: 'ws1' }])
  await dispatch('channels.accounts', 'simulate', { id: 'a1', type: 'message', from: '+995599123456', text: 'hi', workspaceId: 'ws1' })
  t.deepEqual(calls[5], ['simulate', 'a1', { type: 'message', from: '+995599123456', text: 'hi' }, { workspaceId: 'ws1' }])
  await dispatch('channels.inbox', 'list', { assignee: 'me', unread: true, limit: 20, workspaceId: 'ws1' })
  t.equal(calls[6][0], 'inbox')
  t.equal(calls[6][1].assignee, 'me')
  t.equal(calls[6][2].limit, 20)
  t.equal(calls[6][2].workspaceId, 'ws1')
  await dispatch('channels.timeline', 'list', { regardingType: 'record:crm_deals', regardingId: 'r1', partyId: 'p1', workspaceId: 'ws1' })
  t.equal(calls[7][0], 'timeline')
  t.equal(calls[7][1].regardingType, 'record:crm_deals')
  t.equal(calls[7][1].partyId, 'p1')
  await dispatch('channels.messages', 'send', { channel: 'sms', partyId: 'p1', text: 'Hi', workspaceId: 'ws1' })
  t.deepEqual(calls[8], ['send', { channel: 'sms', partyId: 'p1', text: 'Hi' }, { workspaceId: 'ws1' }])
  await dispatch('channels.messages', 'create', { channel: 'sms', partyId: 'p1', text: 'Hi', workspaceId: 'ws1' })
  t.equal(calls[9][0], 'send', 'create = send')
  await dispatch('channels.calls', 'start', { partyId: 'p1', memberPhone: '+995555000111', workspaceId: 'ws1' })
  t.deepEqual(calls[10], ['startCall', { partyId: 'p1', memberPhone: '+995555000111' }, { workspaceId: 'ws1' }])
  await dispatch('channels.calls', 'outcome', { id: 'm1', outcome: 'interested', note: 'Friday', workspaceId: 'ws1' })
  t.deepEqual(calls[11], ['logCallOutcome', 'm1', { outcome: 'interested', note: 'Friday' }, { workspaceId: 'ws1' }])
  await dispatch('channels.calls', 'simulate', { id: 'm1', status: 'completed', durationSec: 42, workspaceId: 'ws1' })
  t.deepEqual(calls[12], ['simulateCall', 'm1', { status: 'completed', durationSec: 42 }, { workspaceId: 'ws1' }])
  await dispatch('channels.conversations', 'read', { id: 'c1', workspaceId: 'ws1' })
  t.deepEqual(calls[13], ['markRead', 'c1', { workspaceId: 'ws1' }])
  t.end()
})

test('channels: workspace settings (the general call number) + the call options', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getSettings({ workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'channels.getSettings')
  t.equal(stub.getCall(0).args[1], '/channels/settings?workspaceId=ws1')
  await svc.updateSettings({ callBridgeNumber: '+995322000303' }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(1).args[0], 'channels.updateSettings')
  t.deepEqual(stub.getCall(1).args.slice(1), [
    '/channels/settings?workspaceId=ws1',
    { method: 'PATCH', body: { callBridgeNumber: '+995322000303' } }
  ])
  await svc.startCall({ channel: 'whatsapp', via: 'device', partyId: 'p1' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(2).args[2], { method: 'POST', body: { channel: 'whatsapp', via: 'device', partyId: 'p1' } })
  await svc.logCallOutcome('m1', { status: 'completed', durationSec: 95, outcome: 'interested' })
  t.deepEqual(stub.getCall(3).args[2], { method: 'PATCH', body: { status: 'completed', durationSec: 95, outcome: 'interested' } })
  sandbox.restore()
  t.end()
})

test('sdk.execute routes: channels.settings get / update', async t => {
  const calls = []
  const svc = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'channels' ? svc : null) })
  await dispatch('channels.settings', 'get', { workspaceId: 'ws1' })
  t.deepEqual(calls[0], ['getSettings', { workspaceId: 'ws1' }])
  await dispatch('channels.settings', 'update', { callBridgeNumber: '+995322000303', workspaceId: 'ws1' })
  t.deepEqual(calls[1], ['updateSettings', { callBridgeNumber: '+995322000303' }, { workspaceId: 'ws1' }], 'workspaceId never rides the body')
  t.end()
})

test('channels.listAudit GETs /channels/audit (admin) and returns rows with pagination; before + limit page it', async t => {
  const svc = makeService()
  const call = sandbox.stub(svc, '_call')
  call.onCall(0).resolves({
    success: true,
    data: [{ id: 'r2', action: 'general-number-set', number: '••••0303' }, { id: 'r1', action: 'connect', number: '••••0101' }],
    pagination: { limit: 2, nextBefore: '1790000000000.6abc00000000000000000001' }
  })
  call.onCall(1).resolves({ success: true, data: [], pagination: { limit: 2, nextBefore: null } })
  const page = await svc.listAudit({}, { limit: 2, workspaceId: 'ws1' })
  t.equal(call.getCall(0).args[0], 'channels.listAudit')
  t.equal(call.getCall(0).args[1], '/channels/audit?limit=2&workspaceId=ws1')
  t.deepEqual(call.getCall(0).args[2], { raw: true })
  t.deepEqual(page.map((r) => r.action), ['general-number-set', 'connect'])
  t.equal(page.pagination.nextBefore, '1790000000000.6abc00000000000000000001')
  const next = await svc.listAudit({ before: page.pagination.nextBefore, bogus: 'x' }, { limit: 2 })
  const u = call.getCall(1).args[1]
  const q = new URLSearchParams(u.slice(u.indexOf('?') + 1))
  t.ok(u.startsWith('/channels/audit?'))
  t.equal(q.get('before'), '1790000000000.6abc00000000000000000001')
  t.equal(q.get('limit'), '2')
  t.equal(q.get('bogus'), null, 'unknown filters are not sent')
  t.equal(next.length, 0)
  t.equal(next.pagination.nextBefore, null)
  sandbox.restore()
  t.end()
})

test('sdk.execute route: channels.audit list → listAudit (workspaceId + limit are options, before is the filter)', async t => {
  const calls = []
  const svc = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'channels' ? svc : null) })
  await dispatch('channels.audit', 'list', { before: 'c1', limit: 20, workspaceId: 'ws1' })
  t.equal(calls[0][0], 'listAudit')
  t.equal(calls[0][1].before, 'c1')
  t.equal(calls[0][2].limit, 20)
  t.equal(calls[0][2].workspaceId, 'ws1')
  t.end()
})

test('channels: browser calls — voiceToken, getCall, the stream (subscribe) and the execute routes', async t => {
  const svc = makeService()
  const call = sandbox.stub(svc, '_call').resolves({})
  await svc.voiceToken({ accountId: 'a1' }, { workspaceId: 'ws1' })
  t.deepEqual(call.getCall(0).args, ['channels.voiceToken', '/channels/voice/token?workspaceId=ws1', { method: 'POST', body: { accountId: 'a1' } }])
  await svc.getCall('c1', { workspaceId: 'ws1' })
  t.deepEqual(call.getCall(1).args, ['channels.getCall', '/channels/calls/c1?workspaceId=ws1'])

  const sse = sandbox.stub(svc, '_sseSubscribe').returns(() => {})
  const seen = []
  const unsub = svc.subscribe({ workspaceId: 'ws1' }, (e) => seen.push(e))
  t.equal(typeof unsub, 'function')
  const [path, params, deliver, opts] = sse.getCall(0).args
  t.equal(path, '/channels/stream')
  t.deepEqual(params, { workspaceId: 'ws1' })
  t.equal(opts.flatParams, true)
  t.deepEqual(opts.events.map((e) => e.name), ['channels.open', 'channels.call'])
  deliver(opts.events[1].frame({ id: 'c1', call: { id: 'c1' }, ring: false }))
  t.deepEqual(seen[0], { type: 'channels.call', id: 'c1', call: { id: 'c1' }, ring: false })
  t.throws(() => svc.subscribe({}, null), /onEvent/)

  const calls = []
  const proxy = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'channels' ? proxy : null) })
  await dispatch('channels.voice', 'token', { accountId: 'a1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], ['voiceToken', { accountId: 'a1' }, { workspaceId: 'ws1' }])
  await dispatch('channels.calls', 'get', { id: 'c1', workspaceId: 'ws1' })
  t.deepEqual(calls[1], ['getCall', 'c1', { workspaceId: 'ws1' }])
  sandbox.restore()
  t.end()
})
