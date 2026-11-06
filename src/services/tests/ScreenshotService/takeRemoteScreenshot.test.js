import test from 'tape'
import sinon from 'sinon'
import { ScreenshotService } from '../../ScreenshotService.js'

const sandbox = sinon.createSandbox()

test('takeRemoteScreenshot — POSTs the shot params to the literal /screenshots/remote-shot path', async t => {
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').returns()
  const requestStub = sandbox
    .stub(service, '_request')
    .resolves({ success: true, data: { screenshot: 'https://storage.screenshotapi.net/x.webp' } })

  const params = { appKey: 'demo.symbo.ls', key: 'Button', width: 320, height: 200, hideUi: true, globalTheme: 'dark' }
  const data = await service.takeRemoteScreenshot(params)

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/screenshots/remote-shot', 'literal route')
  t.equal(opts.method, 'POST', 'POST')
  t.equal(opts.methodName, 'takeRemoteScreenshot', 'methodName set')
  t.deepEqual(JSON.parse(opts.body), params, 'params sent as JSON body, unchanged')
  t.notOk(/token/i.test(opts.body), 'client sends no provider token')
  t.deepEqual(data, { screenshot: 'https://storage.screenshotapi.net/x.webp' }, 'envelope unwrapped to provider body')
  sandbox.restore()
  t.end()
})

test('takeRemoteScreenshot — server error envelope throws with its message', async t => {
  const service = new ScreenshotService()
  sandbox.stub(service, '_requireReady').returns()
  sandbox.stub(service, '_request').resolves({ success: false, message: 'Remote screenshots are not configured' })
  try {
    await service.takeRemoteScreenshot({ appKey: 'demo.symbo.ls', key: 'Button' })
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /not configured/, 'message surfaces')
  }
  sandbox.restore()
  t.end()
})

test('takeRemoteScreenshot — appKey and key are required', async t => {
  const service = new ScreenshotService()
  const requestStub = sandbox.stub(service, '_request')
  for (const p of [{ key: 'Button' }, { appKey: 'demo.symbo.ls' }]) {
    try {
      await service.takeRemoteScreenshot(p)
      t.fail('should throw')
    } catch (e) {
      t.match(e.message, /required/)
    }
  }
  t.equal(requestStub.callCount, 0, 'no request on bad input')
  sandbox.restore()
  t.end()
})
