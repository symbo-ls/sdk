import test from 'tape'
import { FileService } from '../../FileService.js'

// #region Tests
test('validateFile should return a good file url', t => {
  t.plan(1)
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const fileServiceStub = new FileService()
  const response = fileServiceStub.validateFile(mockFile)
  t.ok(response.length === 0, 'Empty array of errors is succesfully returned')
  t.end()
})

test('file validation should return an error', t => {
  t.plan(1)
  const mockFile = false
  const fileServiceStub = new FileService()
  const response = fileServiceStub.validateFile(mockFile)
  t.equal(
    response[0],
    'File is required',
    'File validation successfully threw an error'
  )
  t.end()
})

test('size validation should return an error', t => {
  t.plan(1)
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const mockOptions = {
    maxSize: 1
  }
  const fileServiceStub = new FileService()
  const response = fileServiceStub.validateFile(mockFile, mockOptions)
  t.ok(
    response[0].includes('File size (0.00MB) exceeds maximum allowed size of '),
    'Size validation successfully threw an error'
  )
  t.end()
})

test('allowedTypes validation should return an error', t => {
  t.plan(1)
  const mockFile = new File(['file contents'], 'filename.txt', {
    type: 'text/*'
  })
  const mockOptions = {
    allowedTypes: ['test123']
  }
  const fileServiceStub = new FileService()
  const response = fileServiceStub.validateFile(mockFile, mockOptions)
  t.equal(
    response[0],
    "File type 'text/*' is not allowed. Allowed types: test123",
    'allowedTypes validation should return an error'
  )
  t.end()
})
// #endregion
