import test from 'tape'
import sinon from 'sinon'
import { DnsService } from '../../DnsService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new DnsService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('project custom-domain methods call API-owned workflow endpoints', async t => {
  t.plan(13)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')
  request.onCall(0).resolves({ success: true, data: { hostname: 'www.example.com' } })
  request.onCall(1).resolves({
    success: true,
    data: { domains: { map: {} }, onboarding: [] },
    warnings: [{ action: 'create', hostname: 'www.example.com' }]
  })
  request.onCall(2).resolves({ success: true, data: { state: 'needs_dns' } })
  request.onCall(3).resolves({ success: true, data: { records: [] } })
  request.onCall(4).resolves({ success: true, data: { removed: 'www.example.com' } })

  const check = await svc.checkProjectDomain('p1', 'www.example.com')
  const add = await svc.addProjectCustomDomains('p1', 'www.example.com', { envKey: 'staging' })
  const status = await svc.getProjectCustomDomainStatus('p1', 'www.example.com')
  const instructions = await svc.getProjectDomainInstructions('p1', 'www.example.com')
  const removed = await svc.removeProjectCustomDomain('p1', 'www.example.com')

  t.equal(request.getCall(0).args[0], '/projects/p1/domains/check/www.example.com')
  t.equal(request.getCall(0).args[1].method, 'GET')
  t.equal(request.getCall(1).args[0], '/projects/p1/domains')
  t.equal(request.getCall(1).args[1].method, 'PATCH')
  t.deepEqual(JSON.parse(request.getCall(1).args[1].body), {
    customDomains: 'www.example.com',
    envKey: 'staging'
  })
  t.equal(request.getCall(2).args[0], '/projects/p1/domains/status/www.example.com')
  t.equal(request.getCall(3).args[0], '/projects/p1/domains/instructions/www.example.com')
  t.equal(request.getCall(4).args[0], '/projects/p1/domains/www.example.com')
  t.equal(request.getCall(4).args[1].method, 'DELETE')
  t.deepEqual(check, { hostname: 'www.example.com' })
  t.deepEqual(add.warnings, [{ action: 'create', hostname: 'www.example.com' }])
  t.deepEqual(status, { state: 'needs_dns' })
  t.deepEqual(removed, { removed: 'www.example.com' })
  void instructions
  sandbox.restore()
})

test('project custom-domain methods preserve stable server error metadata', async t => {
  t.plan(6)
  const svc = makeService()
  const body = {
    error: 'domain_already_claimed',
    conflicts: [{ hostname: 'www.example.com', projectId: 'other' }],
    operations: { added: ['www.example.com'], removed: [], updated: [] }
  }
  const httpError = new Error('Domain already claimed', { cause: body })
  httpError.status = 409
  const wrapped = new Error('Request failed: Domain already claimed', { cause: httpError })
  wrapped.status = 409
  sandbox.stub(svc, '_request').rejects(wrapped)

  try {
    await svc.addProjectCustomDomain('p1', 'www.example.com')
    t.fail('expected addProjectCustomDomain to throw')
  } catch (err) {
    t.equal(err.status, 409)
    t.equal(err.code, 'domain_already_claimed')
    t.deepEqual(err.conflicts, body.conflicts)
    t.deepEqual(err.operations, body.operations)
    t.deepEqual(err.body, body)
    t.equal(err.cause, wrapped)
  }
  sandbox.restore()
})

test('startProjectCustomDomainSetup returns check, add, selected status, records, and warnings', async t => {
  t.plan(8)
  const svc = makeService()
  sandbox.stub(svc, 'checkProjectDomain').resolves({
    hostname: 'www.example.com',
    configured: false,
    state: 'needs_dns',
    records: [{ type: 'CNAME', purpose: 'routing' }]
  })
  sandbox.stub(svc, 'addProjectCustomDomains').resolves({
    onboarding: [
      {
        hostname: 'www.example.com',
        env: 'staging',
        configured: true,
        state: 'pending_hostname_validation',
        records: [{ type: 'TXT', purpose: 'hostname_validation' }],
        warnings: [{ action: 'cloudflare_status' }]
      }
    ],
    warnings: [{ action: 'create' }]
  })

  const result = await svc.startProjectCustomDomainSetup('p1', 'www.example.com', {
    envKey: 'staging'
  })

  t.equal(result.projectId, 'p1')
  t.equal(result.hostname, 'www.example.com')
  t.equal(result.env, 'staging')
  t.equal(result.configured, true)
  t.equal(result.state, 'pending_hostname_validation')
  t.deepEqual(result.records, [{ type: 'TXT', purpose: 'hostname_validation' }])
  t.deepEqual(result.warnings, [{ action: 'create' }, { action: 'cloudflare_status' }])
  t.equal(svc.addProjectCustomDomains.firstCall.args[2].envKey, 'staging')
  sandbox.restore()
})

test('pollProjectCustomDomainStatus resolves once a terminal state is reached', async t => {
  t.plan(4)
  const svc = makeService()
  const status = sandbox.stub(svc, 'getProjectCustomDomainStatus')
  status.onCall(0).resolves({ hostname: 'www.example.com', state: 'needs_dns' })
  status.onCall(1).resolves({ hostname: 'www.example.com', state: 'active' })

  const result = await svc.pollProjectCustomDomainStatus('p1', 'www.example.com', {
    intervalMs: 1,
    timeoutMs: 50
  })

  t.equal(status.callCount, 2)
  t.deepEqual(status.firstCall.args, ['p1', 'www.example.com'])
  t.equal(result.state, 'active')
  t.equal(result.hostname, 'www.example.com')
  sandbox.restore()
})
