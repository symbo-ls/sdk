import test from 'tape'
import sinon from 'sinon'
import { MetricsService } from '../../MetricsService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new MetricsService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getContributions (drift-inline regression) ---------------------------------

test('getContributions — no options hits /metrics/contributions (literal)', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getContributions()
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/metrics/contributions', 'URL is bare literal')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getContributions — with options appends query string', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getContributions({ projectId: 'p1', userId: 'u1', from: '2026-01-01', to: '2026-03-31' })
  t.equal(
    requestStub.firstCall.args[0],
    '/metrics/contributions?projectId=p1&userId=u1&from=2026-01-01&to=2026-03-31',
    'URL has all query params'
  )
  sandbox.restore()
  t.end()
})

test('getContributions — nullish options are filtered', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.getContributions({ projectId: 'p1', userId: null, from: undefined })
  t.equal(
    requestStub.firstCall.args[0],
    '/metrics/contributions?projectId=p1',
    'null + undefined are dropped'
  )
  sandbox.restore()
  t.end()
})

// getProjectUsage ------------------------------------------------------------

test('getProjectUsage hits /usage/project/:projectId with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const payload = { creditsUsed: 420, creditsLimit: 1000, period: 'march' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: payload })
  const result = await svc.getProjectUsage('p1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/usage/project/p1', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getProjectUsage throws without projectId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getProjectUsage('') } catch (err) {
    t.equal(err.message, 'projectId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('getProjectUsage throws on non-success response', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'not_found' })
  try {
    await svc.getProjectUsage('p1')
  } catch (err) {
    t.equal(err.message, 'not_found', 'propagates server message')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
