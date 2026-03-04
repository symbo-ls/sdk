import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('uploadFile should return response data', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const file = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_request').resolves(uploadFileResponseStub)
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  const response = await fileServiceStub.uploadFile(file)
  t.equal(
    response,
    uploadFileResponseStub.data,
    'Response data matches stubbed data'
  )
  sandbox.restore()
  t.end()
})

test('file validation should throw an error when no file is uploaded', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_request').resolves(uploadFileResponseStub)
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  try {
    await fileServiceStub.uploadFile()
    t.fail('file validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: File is required for upload',
      'file validation successfully threw an error when no file was uploaded.'
    )
  }
  sandbox.restore()
  t.end()
})

test('uploadFile error handling catches and returns an error', async t => {
  t.plan(1)
  const file = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  sandbox.stub(fileServiceStub, '_request').throws('Test Error')
  try {
    await fileServiceStub.uploadFile(file)
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: File upload failed: Sinon-provided Test Error',
      'Error handling caught and returned the correct error.'
    )
  }
  sandbox.restore()
  t.end()
})
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
