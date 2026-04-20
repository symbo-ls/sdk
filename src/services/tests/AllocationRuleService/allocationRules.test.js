import test from 'tape'
import sinon from 'sinon'
import { AllocationRuleService } from '../../AllocationRuleService.js'

const sandbox = sinon.createSandbox()

function makeStub () {
  const svc = new AllocationRuleService()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: 'ok' })
  return { svc, stub }
}

test('listRules (no orgId) hits /allocation-rules with GET', async t => {
  t.plan(3)
  const { svc, stub } = makeStub()
  const data = await svc.listRules()
  t.equal(data, 'ok')
  t.equal(stub.firstCall.args[0], '/allocation-rules')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('listRules (with orgId) appends ?organizationId', async t => {
  t.plan(1)
  const { svc, stub } = makeStub()
  await svc.listRules('org-1')
  t.equal(stub.firstCall.args[0], '/allocation-rules?organizationId=org-1')
  sandbox.restore()
  t.end()
})

test('getRule throws without ruleId', async t => {
  t.plan(1)
  const svc = new AllocationRuleService()
  sandbox.stub(svc, '_requireReady').resolves()
  try {
    await svc.getRule()
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'ruleId is required')
  }
  sandbox.restore()
  t.end()
})

test('getRule hits /allocation-rules/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.getRule('rule-1')
  t.equal(stub.firstCall.args[0], '/allocation-rules/rule-1')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('createRule POSTs full body', async t => {
  t.plan(3)
  const { svc, stub } = makeStub()
  await svc.createRule({
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    policy: 'priority',
    monthlyAllocation: 1000,
    priority: 10,
  })
  t.equal(stub.firstCall.args[0], '/allocation-rules')
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), {
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    policy: 'priority',
    monthlyAllocation: 1000,
    priority: 10,
  })
  sandbox.restore()
  t.end()
})

test('createRule throws without organizationId', async t => {
  t.plan(1)
  const svc = new AllocationRuleService()
  sandbox.stub(svc, '_requireReady').resolves()
  try {
    await svc.createRule({ policy: 'priority' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'organizationId is required')
  }
  sandbox.restore()
  t.end()
})

test('updateRule PATCHes /allocation-rules/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.updateRule('rule-1', { priority: 5 })
  t.equal(stub.firstCall.args[0], '/allocation-rules/rule-1')
  t.equal(stub.firstCall.args[1].method, 'PATCH')
  sandbox.restore()
  t.end()
})

test('deleteRule DELETEs /allocation-rules/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.deleteRule('rule-1')
  t.equal(stub.firstCall.args[0], '/allocation-rules/rule-1')
  t.equal(stub.firstCall.args[1].method, 'DELETE')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
