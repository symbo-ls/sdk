import test from 'tape'
import sinon from 'sinon'
import { ConversationService } from '../../ConversationService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new ConversationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── Collection CRUD ─────────────────────────────────────────────────────────

test('conversations.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'conversations.list', 'name')
  t.equal(stub.firstCall.args[1], '/conversations', 'no query string')
  sandbox.restore()
  t.end()
})

test('conversations.list threads status/party/assignee', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ status: 'open', party: 'p1', assignee: 'u1' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('status=open'), 'status threaded')
  t.ok(path.includes('party=p1'), 'party threaded')
  t.ok(path.includes('assignee=u1'), 'assignee threaded')
  sandbox.restore()
  t.end()
})

test('conversations.get GETs /conversations/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('c/1')
  t.equal(stub.firstCall.args[0], 'conversations.get', 'name')
  t.equal(stub.firstCall.args[1], '/conversations/c%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('conversations.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { channel: 'webchat', party: 'p1', subject: 'Support' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/conversations', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('conversations.update PATCHes /conversations/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('c1', { status: 'closed' })
  t.equal(stub.firstCall.args[1], '/conversations/c1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { status: 'closed' }, 'body')
  sandbox.restore()
  t.end()
})

test('conversations.remove DELETEs /conversations/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('c1')
  t.equal(stub.firstCall.args[1], '/conversations/c1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE (tombstone)')
  sandbox.restore()
  t.end()
})

// ─── Messages sub-resource ───────────────────────────────────────────────────

test('conversations.listMessages GETs /conversations/:id/messages', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listMessages('c1')
  t.equal(stub.firstCall.args[0], 'conversations.listMessages', 'name')
  t.equal(stub.firstCall.args[1], '/conversations/c1/messages', 'messages path')
  sandbox.restore()
  t.end()
})

test('conversations.addMessage POSTs {direction, from, to, body, attachments}', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const msg = { direction: 'outbound', from: 'agent@x.co', to: 'p@x.co', body: 'hi', attachments: [] }
  await svc.addMessage('c1', msg)
  t.equal(stub.firstCall.args[0], 'conversations.addMessage', 'name')
  t.equal(stub.firstCall.args[1], '/conversations/c1/messages', 'messages path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, msg, 'message body')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('conversations threads workspaceId across reads, writes + the messages sub-resource', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('c1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ channel: 'webchat' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.listMessages('c1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'listMessages threads ws')
  await svc.addMessage('c1', { direction: 'inbound', body: 'hey' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'addMessage threads ws')
  sandbox.restore()
  t.end()
})
