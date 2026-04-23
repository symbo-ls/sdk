import test from 'tape'
import sinon from 'sinon'
import { ScreenshotService } from '../../ScreenshotService.js'

const sandbox = sinon.createSandbox()

test('getScreenshotByKey — component type hits /components/:key literal path', async t => {
  t.plan(3)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves({ ok: true })

  await service.getScreenshotByKey({ owner: 'acme', key: 'marketing' }, 'component', 'Button', 'json')

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/screenshots/projects/acme/marketing/components/Button?format=json',
    'URL uses literal /components/ segment'
  )
  t.equal(opts.method, 'GET', 'HTTP method is GET')
  t.equal(opts.methodName, 'getScreenshotByKey', 'methodName set for telemetry')

  sandbox.restore()
  t.end()
})

test('getScreenshotByKey — page type hits /pages/:key literal path', async t => {
  t.plan(2)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves({ ok: true })

  await service.getScreenshotByKey({ owner: 'acme', key: 'marketing' }, 'page', 'home', 'json')

  const [endpoint] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/screenshots/projects/acme/marketing/pages/home?format=json',
    'URL uses literal /pages/ segment'
  )
  t.ok(!endpoint.includes('/components/'), 'No /components/ segment in page-type path')

  sandbox.restore()
  t.end()
})

test('getScreenshotByKey — bare-string projectKey + no format param', async t => {
  t.plan(1)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves({ ok: true })

  await service.getScreenshotByKey('marketing', 'component', 'Hero', '')

  const [endpoint] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/screenshots/projects/marketing/components/Hero',
    'Legacy 1-seg project key still works; no query string when format is empty'
  )

  sandbox.restore()
  t.end()
})

test('getScreenshotByKey — url-encodes special characters in key', async t => {
  t.plan(1)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves({ ok: true })

  await service.getScreenshotByKey({ owner: 'acme', key: 'site' }, 'page', 'about/team', 'json')

  const [endpoint] = requestStub.firstCall.args
  t.equal(
    endpoint,
    '/screenshots/projects/acme/site/pages/about%2Fteam?format=json',
    'Slash in key is percent-encoded'
  )

  sandbox.restore()
  t.end()
})

test('getScreenshotByKey — rejects invalid type', async t => {
  t.plan(1)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()

  try {
    await service.getScreenshotByKey({ owner: 'a', key: 'b' }, 'bogus', 'k')
    t.fail('should have thrown on invalid type')
  } catch (err) {
    t.equal(
      err.message,
      "type must be 'component' or 'page'",
      'Throws the expected validation error'
    )
  }

  sandbox.restore()
  t.end()
})

test('getScreenshotByKey — rejects missing key', async t => {
  t.plan(1)
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').resolves()

  try {
    await service.getScreenshotByKey({ owner: 'a', key: 'b' }, 'component', '')
    t.fail('should have thrown on empty key')
  } catch (err) {
    t.equal(err.message, 'key is required', 'Throws the expected validation error')
  }

  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
