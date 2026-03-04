/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('uploadMultipleFiles should return response data', async t => {
  t.plan(3)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const firstMockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const secondMockFile = new File(['file contents'], 'filename1.txt', {
    type: 'text/*'
  })
  const files = [firstMockFile, secondMockFile]
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, 'uploadFile').resolves(uploadFileResponseStub)
  const response = await fileServiceStub.uploadMultipleFiles(files)
  t.equal(
    response.length,
    2,
    'Actual number of uploaded files matches expected number of files'
  )
  t.ok(
    response[0].success,
    'response for first file uploaded successfully returned'
  )
  t.ok(
    response[1].success,
    'response for second file uploaded successfully returned'
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
  sandbox.stub(fileServiceStub, 'uploadFile').resolves(uploadFileResponseStub)
  try {
    await fileServiceStub.uploadMultipleFiles()
    t.fail('file validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Files array is required and must not be empty',
      'file validation successfully threw an error when no file was uploaded.'
    )
  }
  sandbox.restore()
  t.end()
})

function checkFileTypeValidation () {
  const badData = [
    { name: 'Number value', value: 123 },
    { name: 'False boolean value', value: false },
    { name: 'True boolean value', value: true },
    { name: 'Empty String value', value: '' },
    { name: 'Object value', value: {} },
    { name: 'Null value', value: null },
    { name: 'Undefined value', value: undefined }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`file validation should throw an error when: ${badData[ii].name} is uploaded`, async t => {
      t.plan(1)
      const uploadFileResponseStub = {
        success: true,
        data: 'test data response'
      }
      const fileServiceStub = new FileService()
      sandbox
        .stub(fileServiceStub, 'uploadFile')
        .resolves(uploadFileResponseStub)
      try {
        await fileServiceStub.uploadMultipleFiles(badData[ii].value)
        t.fail('file validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Files array is required and must not be empty',
          `file validation successfully threw an error when: ${badData[ii].name} was uploaded.`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

checkFileTypeValidation()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
