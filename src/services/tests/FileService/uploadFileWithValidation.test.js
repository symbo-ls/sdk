import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('uploadFileWithValidation should return response data', async t => {
  t.plan(2)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const fileServiceStub = new FileService()
  const uploadFileStub = sandbox
    .stub(fileServiceStub, 'uploadFile')
    .resolves(uploadFileResponseStub)
  const response = await fileServiceStub.uploadFileWithValidation(mockFile)
  t.ok(response.success, 'response successfully returned')
  t.ok(uploadFileStub.calledOnce, 'uploadFileStub called once')
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
  sandbox.stub(fileServiceStub, 'uploadFile').resolves(uploadFileResponseStub)
  try {
    await fileServiceStub.uploadFileWithValidation()
    t.fail('file validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: File is required',
      'file validation successfully threw an error when no file was uploaded.'
    )
  }
  sandbox.restore()
  t.end()
})

test('file size validation throws an error', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const options = {
    maxSize: 1
  }
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, 'uploadFile').resolves(uploadFileResponseStub)
  try {
    await fileServiceStub.uploadFileWithValidation(mockFile, options)
    t.fail('file size validation successfully threw an error')
  } catch (err) {
    t.ok(
      err
        .toString()
        .includes('Error: File size exceeds maximum allowed size of ')
    )
  }
  sandbox.restore()
  t.end()
})

test('isValid type check throws an error', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const options = {
    allowedTypes: ['test type']
  }
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, 'uploadFile').resolves(uploadFileResponseStub)
  try {
    await fileServiceStub.uploadFileWithValidation(mockFile, options)
    t.fail('isValid check successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      "Error: File type 'text/*' is not allowed. Allowed types: test type",
      'isValid check succeeded.'
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
