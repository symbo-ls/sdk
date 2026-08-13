import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for getWorkspaceUsageByActor — the CREDITS-ATTR-3 attribution
// page's data source (tickets/fable.md CREDITS-ATTR-3, tickets/sonnet.md
// CREDITS-ATTR-2). The server route this calls (`GET
// /workspaces/:workspaceId/usage/by-actor`) is a CONTRACT owned by
// CREDITS-ATTR-2 and may not exist yet — this suite only pins the SDK's own
// request-shaping contract (endpoint, querystring, envelope unwrap, required
// args), the same scope memberRecordScope.test.js / updateWorkspaceSettings
// .test.js hold for their sibling methods. Transport is mocked at `_request`.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('teardown-before', (t) => {
  sandbox.restore()
  t.end()
})

test('getWorkspaceUsageByActor is flat-exposed by the SDK under the workspace service', (t) => {
  t.plan(1)
  t.equal(SERVICE_METHODS.getWorkspaceUsageByActor, 'workspace')
})

test('getWorkspaceUsageByActor GETs the by-actor sub-resource with no query when no options are passed', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.getWorkspaceUsageByActor('ws1')

  t.equal(request.firstCall.args[0], '/workspaces/ws1/usage/by-actor')
  t.equal(request.firstCall.args[1].method, 'GET', '_call defaults method to GET')
  sandbox.restore()
})

test('getWorkspaceUsageByActor threads period/from/to onto the querystring', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.getWorkspaceUsageByActor('ws1', {
    period: 'month',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-13T00:00:00.000Z',
  })

  const [endpoint] = request.firstCall.args
  t.equal(
    endpoint,
    '/workspaces/ws1/usage/by-actor?period=month&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-13T00%3A00%3A00.000Z',
  )
  sandbox.restore()
})

test('getWorkspaceUsageByActor accepts Date instances for from/to (ISO-serialized)', async (t) => {
  t.plan(1)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })

  await svc.getWorkspaceUsageByActor('ws1', {
    from: new Date('2026-08-01T00:00:00.000Z'),
  })

  const [endpoint] = request.firstCall.args
  t.ok(endpoint.includes(encodeURIComponent('2026-08-01T00:00:00.000Z')))
  sandbox.restore()
})

test('getWorkspaceUsageByActor resolves the unwrapped data, not the {success,data} envelope', async (t) => {
  t.plan(1)
  const svc = makeService()
  const data = {
    period: 'month',
    totalCredits: 4200,
    members: [{ userId: 'u1', name: 'Nika', credits: 1000, eventCount: 4 }],
    system: [{ cause: 'deploy', credits: 3000, eventCount: 12 }],
    machines: [{ machineLabel: 'ci-bot', credits: 200, eventCount: 2 }],
    unattributed: { credits: 0, eventCount: 0, before: null },
  }
  sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.getWorkspaceUsageByActor('ws1')

  t.deepEqual(result, data)
  sandbox.restore()
})

test('getWorkspaceUsageByActor throws without workspaceId (no request sent)', async (t) => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.getWorkspaceUsageByActor()
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
