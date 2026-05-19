import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('chat.addMember POSTs to /chat/members with channel_id folded into payload', async t => {
  t.plan(4)
  const svc = makeService()
  const wsStub = sandbox.stub(svc, '_ws').resolves({ data: { id: 'm1' } })
  await svc.chat.addMember('chan-123', { member_email: 'a@b.com', role: 'owner' })
  const [methodName, endpoint, opts] = wsStub.firstCall.args
  t.equal(methodName, 'chat.addMember', 'methodName tag')
  t.equal(endpoint, '/chat/members', 'uses bulk endpoint, not per-channel')
  t.equal(opts.method, 'POST', 'POST')
  t.deepEqual(
    opts.body,
    { payload: { member_email: 'a@b.com', role: 'owner', channel_id: 'chan-123' } },
    'channel_id folded into payload body'
  )
  sandbox.restore()
  t.end()
})

test('chat.addMember preserves caller payload fields (does not drop role/email)', async t => {
  t.plan(1)
  const svc = makeService()
  const wsStub = sandbox.stub(svc, '_ws').resolves({ data: {} })
  const payload = { member_email: 'x@y.com', role: 'member', extra: { meta: 1 } }
  await svc.chat.addMember('chan-999', payload)
  t.deepEqual(
    wsStub.firstCall.args[2].body.payload,
    { ...payload, channel_id: 'chan-999' },
    'spread preserves caller fields'
  )
  sandbox.restore()
  t.end()
})
