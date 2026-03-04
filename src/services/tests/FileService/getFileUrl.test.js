/* eslint-disable no-undefined */
import test from 'tape'
import { FileService } from '../../FileService.js'
import { BaseService } from '../../BaseService.js'

// #region Tests
test('getFileUrl should return a good file url', t => {
  t.plan(1)
  const mockFileId = 'testFileId'
  const fileServiceStub = new FileService()
  const baseServiceStub = new BaseService()
  const response = fileServiceStub.getFileUrl(mockFileId)
  t.equal(
    response,
    `${baseServiceStub._apiUrl}/core/files/public/${mockFileId}/download`,
    'Actual file url matches expected file url'
  )
  t.end()
})

function testFileIdValidation () {
  const badData = [
    {
      name: 'Empty String',
      fileId: ''
    },
    {
      name: 'Undefined',
      fileId: undefined
    },
    {
      name: 'Null',
      fileId: null
    },
    {
      name: 'False boolean value',
      fileId: false
    },
    {
      name: 'True boolean value',
      fileId: true
    },
    {
      name: 'Object',
      fileId: {}
    }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`fileId validation should throw an error when fileId value is: ${badData[ii].name}`, t => {
      t.plan(1)
      const mockFileId = null
      const fileServiceStub = new FileService()
      try {
        fileServiceStub.getFileUrl(mockFileId)
        t.fail('file ID successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: File ID is required',
          `file ID validation successfully threw an error when fileId is: ${badData[ii].name}`
        )
      }
      t.end()
    })
  }
}

testFileIdValidation()
// #endregion
