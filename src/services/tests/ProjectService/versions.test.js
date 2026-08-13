import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

// Version-history read surface (workspace Version History UI, 2026-08-07).
// getProjectVersion / getLatestProjectVersion / getProjectVersionData are the
// gap-fill wrappers over the server's /core/projects/:id/versions/* routes;
// getProjectVersions grows an optional `fields` passthrough (changesCount
// badges) that must leave the legacy query byte-identical when absent.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getProjectVersions ---------------------------------------------------------

test('getProjectVersions — default query unchanged when fields absent', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { versions: [] } })
  await svc.getProjectVersions('p1')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/p1/versions?branch=main&page=1&limit=50',
    'legacy query shape preserved'
  )
  t.equal(requestStub.firstCall.args[1].method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getProjectVersions — fields array joins to csv', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { versions: [] } })
  await svc.getProjectVersions('p1', { branch: 'main', page: 2, limit: 30, fields: ['value', 'message', 'changesCount'] })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/p1/versions?branch=main&page=2&limit=30&fields=value%2Cmessage%2CchangesCount',
    'fields csv appended'
  )
  sandbox.restore()
  t.end()
})

// getProjectVersion ----------------------------------------------------------

test('getProjectVersion — GET /projects/:id/versions/:versionId', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { _id: 'v1' } })
  const out = await svc.getProjectVersion('p1', 'v1')
  t.equal(requestStub.firstCall.args[0], '/projects/p1/versions/v1', 'URL')
  t.equal(requestStub.firstCall.args[1].method, 'GET', 'method GET')
  t.deepEqual(out, { _id: 'v1' }, 'returns data')
  sandbox.restore()
  t.end()
})

test('getProjectVersion — throws without versionId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.getProjectVersion('p1')
    t.fail('should throw')
  } catch (err) {
    t.match(err.message, /Version ID is required/, 'guards versionId')
  }
  sandbox.restore()
  t.end()
})

// getLatestProjectVersion ----------------------------------------------------

test('getLatestProjectVersion — GET /versions/latest with branch', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { value: '1.2.3' } })
  await svc.getLatestProjectVersion('p1', { branch: 'staging' })
  t.equal(requestStub.firstCall.args[0], '/projects/p1/versions/latest?branch=staging', 'URL with branch')
  sandbox.restore()
  t.end()
})

// getProjectVersionData ------------------------------------------------------

test('getProjectVersionData — GET /versions/:versionId/data', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { pages: {} } })
  const out = await svc.getProjectVersionData('p1', '65a1b2c3d4e5f6a7b8c9d0e1')
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/p1/versions/65a1b2c3d4e5f6a7b8c9d0e1/data',
    'URL'
  )
  t.equal(requestStub.firstCall.args[1].method, 'GET', 'method GET')
  t.deepEqual(out, { pages: {} }, 'returns payload')
  sandbox.restore()
  t.end()
})

test('getProjectVersionData — surfaces server failure message', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'version_not_found' })
  try {
    await svc.getProjectVersionData('p1', 'v-missing')
    t.fail('should throw')
  } catch (err) {
    t.match(err.message, /version_not_found/, 'error propagated')
  }
  sandbox.restore()
  t.end()
})
