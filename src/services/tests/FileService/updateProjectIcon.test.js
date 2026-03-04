/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { FileService } from '../../FileService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('updateProjectIcon should return response data', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const projectIdStub = sandbox.stub()
  const iconStub = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_request').resolves(uploadFileResponseStub)
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  const response = await fileServiceStub.updateProjectIcon(
    projectIdStub,
    iconStub
  )
  t.equal(
    response,
    uploadFileResponseStub.data,
    'Response data matches stubbed data'
  )
  sandbox.restore()
  t.end()
})

test('projectId validation should throw an error', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const iconStub = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_request').resolves(uploadFileResponseStub)
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  try {
    await fileServiceStub.updateProjectIcon(undefined, iconStub)
    t.fail('file validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Project ID and icon file are required',
      'file validation successfully threw an error when no file was uploaded.'
    )
  }
  sandbox.restore()
  t.end()
})

test('iconFile validation should throw an error', async t => {
  t.plan(1)
  const uploadFileResponseStub = {
    success: true,
    data: 'test data response'
  }
  const projectIdStub = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_request').resolves(uploadFileResponseStub)
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  try {
    await fileServiceStub.updateProjectIcon(projectIdStub)
    t.fail('file validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Project ID and icon file are required',
      'file validation successfully threw an error when no file was uploaded.'
    )
  }
  sandbox.restore()
  t.end()
})

test('updateProjectIcon error handling catches and returns an error', async t => {
  t.plan(1)
  const projectIdStub = sandbox.stub()
  const iconStub = sandbox.stub()
  const fileServiceStub = new FileService()
  sandbox.stub(fileServiceStub, '_requireReady').resolves()
  sandbox.stub(fileServiceStub, '_request').throws('Test Error')
  try {
    await fileServiceStub.updateProjectIcon(projectIdStub, iconStub)
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to update project icon: Sinon-provided Test Error',
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
