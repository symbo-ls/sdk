import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('uploadImage should return response data', async t => {
  t.plan(2)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'image/*'
  })
  const fileServiceStub = new FileService()
  const uploadFileStub = sandbox
    .stub(fileServiceStub, 'uploadFileWithValidation')
    .resolves(uploadFileResponseStub)
  const response = await fileServiceStub.uploadImage(mockFile)
  t.ok(response.success, 'response successfully returned')
  t.ok(uploadFileStub.calledOnce, 'uploadFileStub called once')
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
