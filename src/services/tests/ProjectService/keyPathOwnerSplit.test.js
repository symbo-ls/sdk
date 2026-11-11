import test from 'tape'
import sinon from 'sinon'
import { projectKeyPath } from '../../../utils/projectKeyPath.js'
import { ProjectService } from '../../ProjectService.js'
import { ScreenshotService } from '../../ScreenshotService.js'

// An `owner/key` string must reach the server's 2-seg route
// (/projects/key/:owner/:projectSlug — the owner-scoped lookup), as the
// `{ owner, key }` spec and the CLI's getProjectByKey already do. Encoding
// the whole string sent ONE `%2F` segment to the 1-seg route, which has no
// owner: a project created after §45 came back 404 there (2026-11-09,
// `plait/controls-app` right after its create; by id it was found).
// Titles marked "RED ON THE OLD CODE" fail on the whole-string encoding;
// the others guard what must not change.

const sandbox = sinon.createSandbox()
const stubbed = (Service) => {
  const svc = new Service()
  sandbox.stub(svc, '_requireReady').resolves()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  return { svc, requestStub }
}

test('projectKeyPath: owner/key string splits into 2 segments (RED ON THE OLD CODE)', (t) => {
  t.plan(1)
  t.equal(projectKeyPath('plait/controls-app'), 'plait/controls-app', 'RED ON THE OLD CODE: owner/key string is 2 segments')
})

test('projectKeyPath: each segment of owner/key is encoded on its own (RED ON THE OLD CODE)', (t) => {
  t.plan(1)
  t.equal(projectKeyPath('acme co/weird key'), 'acme%20co/weird%20key', 'RED ON THE OLD CODE: segments encoded separately')
})

test('projectKeyPath: a bare key stays 1 segment', (t) => {
  t.plan(1)
  t.equal(projectKeyPath('marketing'), 'marketing', 'GUARD: bare key unchanged')
})

test('projectKeyPath: more than one slash is encoded whole', (t) => {
  t.plan(1)
  t.equal(projectKeyPath('acme/site/role'), 'acme%2Fsite%2Frole', 'GUARD: no 3-segment path')
})

test('projectKeyPath: an empty side is encoded whole', (t) => {
  t.plan(1)
  t.deepEqual([projectKeyPath('/site'), projectKeyPath('acme/')], ['%2Fsite', 'acme%2F'], 'GUARD: empty owner or key unchanged')
})

test('projectKeyPath: the { owner, key } spec is unchanged', (t) => {
  t.plan(1)
  t.deepEqual([projectKeyPath({ owner: 'acme', key: 'site' }), projectKeyPath({ key: 'site' })], ['acme/site', 'site'], 'GUARD: spec unchanged')
})

test('getProjectByKey(owner/key) hits the 2-seg route (RED ON THE OLD CODE)', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ProjectService)
  await svc.getProjectByKey('plait/controls-app')
  t.equal(requestStub.firstCall.args[0], '/projects/key/plait/controls-app', 'RED ON THE OLD CODE: getProjectByKey 2-seg URL')
  sandbox.restore()
})

test('getProjectByKey(owner/key, { workspaceId }) keeps the query on the 2-seg route (RED ON THE OLD CODE)', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ProjectService)
  await svc.getProjectByKey('plait/controls-app', { workspaceId: '507f1f77bcf86cd799439011' })
  t.equal(
    requestStub.firstCall.args[0],
    '/projects/key/plait/controls-app?workspaceId=507f1f77bcf86cd799439011',
    'RED ON THE OLD CODE: getProjectByKey 2-seg URL with workspaceId'
  )
  sandbox.restore()
})

test('getPublicProjectDataByKey(owner/key) hits the 2-seg public route (RED ON THE OLD CODE)', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ProjectService)
  await svc.getPublicProjectDataByKey('acme/site', { envKey: 'production' })
  t.equal(requestStub.firstCall.args[0], '/projects/key/acme/site/public/production/data', 'RED ON THE OLD CODE: public data 2-seg URL')
  sandbox.restore()
})

test('getProjectComponentsByKey(owner/key) hits the 2-seg resources route (RED ON THE OLD CODE)', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ProjectService)
  await svc.getProjectComponentsByKey('acme/marketing')
  t.equal(requestStub.firstCall.args[0], '/projects/key/acme/marketing/resources/components', 'RED ON THE OLD CODE: resources 2-seg URL')
  sandbox.restore()
})

test('getScreenshotByKey(owner/key) hits the 2-seg screenshots route (RED ON THE OLD CODE)', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ScreenshotService)
  await svc.getScreenshotByKey('acme/marketing', 'page', 'home', 'json')
  t.equal(requestStub.firstCall.args[0], '/screenshots/projects/acme/marketing/pages/home?format=json', 'RED ON THE OLD CODE: screenshots 2-seg URL')
  sandbox.restore()
})

test('getProjectByKey(bare key) stays on the 1-seg route', async (t) => {
  t.plan(1)
  const { svc, requestStub } = stubbed(ProjectService)
  await svc.getProjectByKey('my-project')
  t.equal(requestStub.firstCall.args[0], '/projects/key/my-project', 'GUARD: bare key 1-seg URL')
  sandbox.restore()
})
