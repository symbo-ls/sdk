import test from 'tape'
import sinon from 'sinon'

import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = (workspaceId = 'ws-1') => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  svc._context = { activeWorkspaceId: workspaceId }
  return svc
}

test('bookmarks.enrich POSTs the explicit workspace-scoped metadata route and unwraps data', async (t) => {
  t.plan(5)
  const svc = makeService('ws-active')
  const request = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { url: 'https://example.test', title: 'Example' }
  })

  const result = await svc.bookmarks.enrich(
    { url: 'https://example.test', workspaceId: 'ws-explicit' },
    { workspaceId: 'ws-explicit' }
  )

  const [endpoint, options] = request.firstCall.args
  t.equal(endpoint, '/workspaces/ws-explicit/bookmarks/enrich', 'explicit workspace wins')
  t.equal(options.method, 'POST')
  t.equal(options.methodName, 'bookmarks.enrich')
  t.deepEqual(JSON.parse(options.body), { url: 'https://example.test' })
  t.deepEqual(result, { url: 'https://example.test', title: 'Example' })
  sandbox.restore()
  t.end()
})

test('bookmarks.enrich rejects a missing workspace scope before a request can escape tenant routing', async (t) => {
  t.plan(1)
  const svc = makeService(null)
  svc._context = {}
  try {
    await svc.bookmarks.enrich({ url: 'https://example.test' })
    t.fail('missing workspace must throw')
  } catch (error) {
    t.match(error.message, /no workspace scope/)
  }
  sandbox.restore()
  t.end()
})
