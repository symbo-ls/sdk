import test from 'tape'
import { FileService } from '../../FileService.js'

// #region Tests
test('createFileFormData should return a basic formData object', t => {
  t.plan(3)
  const mockFileData = {
    size: 13,
    type: 'text/*',
    name: 'filename.txt'
  }
  const mockFile = new File(['file contents'], mockFileData.name, {
    type: mockFileData.type
  })
  const fileServiceStub = new FileService()
  const response = fileServiceStub.createFileFormData(mockFile)
  t.equal(
    Array.from(response)[0][1].size,
    mockFileData.size,
    'Actual file size matches expected file size'
  )
  t.equal(
    Array.from(response)[0][1].type,
    mockFileData.type,
    'Actual file type matches expected file type'
  )
  t.equal(
    Array.from(response)[0][1].name,
    mockFileData.name,
    'Actual file name matches expected file name'
  )
  t.end()
})

test('createFileFormData should return a formData object with metadata', t => {
  t.plan(4)
  const mockFileData = {
    size: 13,
    type: 'text/*',
    name: 'filename.txt'
  }
  const mockFile = new File(['file contents'], mockFileData.name, {
    type: mockFileData.type
  })
  const mockMetaData = {
    name: 'Test Name',
    description: 'Test Description',
    key: 'Test Key'
  }
  const fileServiceStub = new FileService()
  const response = fileServiceStub.createFileFormData(mockFile, mockMetaData)
  t.equal(
    Array.from(response)[0][1].size,
    mockFileData.size,
    'Actual file size matches expected file size'
  )
  t.equal(
    Array.from(response)[0][1].type,
    mockFileData.type,
    'Actual file type matches expected file type'
  )
  t.equal(
    Array.from(response)[0][1].name,
    mockFileData.name,
    'Actual file name matches expected file name'
  )
  t.equal(
    Array.from(response)[1][1],
    JSON.stringify(mockMetaData),
    'Actual metadata matches expected metadata'
  )
  t.end()
})
// #endregion
