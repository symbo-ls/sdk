import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new FileService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// getFile --------------------------------------------------------------------

test('getFile hits /files/:fileId with GET', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { _id: 'f1' } })
  await svc.getFile('f1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/files/f1', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('getFile throws without fileId', async t => {
  t.plan(1)
  const svc = makeService()
  try { await svc.getFile() } catch (err) {
    t.equal(err.message, 'fileId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

// updateFile -----------------------------------------------------------------

test('updateFile PUTs updates to /files/:fileId', async t => {
  t.plan(3)
  const svc = makeService()
  const updates = { tags: ['reviewed'], visibility: 'public' }
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: updates })
  await svc.updateFile('f1', updates)
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/files/f1', 'URL matches')
  t.equal(opts.method, 'PUT', 'method PUT')
  t.equal(opts.body, JSON.stringify(updates), 'body serialized')
  sandbox.restore()
  t.end()
})

// deleteFile -----------------------------------------------------------------

test('deleteFile DELETEs /files/:fileId', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.deleteFile('f1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/files/f1', 'URL matches')
  t.equal(opts.method, 'DELETE', 'method DELETE')
  sandbox.restore()
  t.end()
})

// listMyUploads --------------------------------------------------------------

test('listMyUploads — defaults page=1, limit=20 append to /files/my-uploads', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.listMyUploads()
  t.equal(
    requestStub.firstCall.args[0],
    '/files/my-uploads?page=1&limit=20',
    'URL has default pagination'
  )
  sandbox.restore()
  t.end()
})

test('listMyUploads — full options append to URL', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.listMyUploads({ page: 3, limit: 50, sortBy: 'createdAt', sortOrder: 'asc' })
  t.equal(
    requestStub.firstCall.args[0],
    '/files/my-uploads?page=3&limit=50&sortBy=createdAt&sortOrder=asc',
    'URL has all four params'
  )
  sandbox.restore()
  t.end()
})

// uploadMarketplaceThumbnail -----------------------------------------------

test('uploadMarketplaceThumbnail POSTs multipart to /marketplace/thumbnail', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { thumbnailUrl: 'https://…' } })
  const file = new Blob(['png-bytes'], { type: 'image/png' })
  await svc.uploadMarketplaceThumbnail(file, { itemId: 'cool-template', kind: 'template' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/marketplace/thumbnail', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.ok(opts.body instanceof FormData, 'body is FormData')
  t.deepEqual(opts.headers, {}, 'empty headers — browser sets multipart boundary')
  sandbox.restore()
  t.end()
})

test('uploadMarketplaceThumbnail throws without file', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.uploadMarketplaceThumbnail(null, { itemId: 'x', kind: 'template' })
  } catch (err) {
    t.equal(err.message, 'thumbnailFile is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('uploadMarketplaceThumbnail throws without itemId', async t => {
  t.plan(1)
  const svc = makeService()
  const file = new Blob(['x'], { type: 'image/png' })
  try {
    await svc.uploadMarketplaceThumbnail(file, { kind: 'template' })
  } catch (err) {
    t.equal(err.message, 'itemId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('uploadMarketplaceThumbnail throws without kind', async t => {
  t.plan(1)
  const svc = makeService()
  const file = new Blob(['x'], { type: 'image/png' })
  try {
    await svc.uploadMarketplaceThumbnail(file, { itemId: 'x' })
  } catch (err) {
    t.equal(err.message, 'kind is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
