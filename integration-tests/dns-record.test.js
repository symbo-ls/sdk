import test from 'tape'
import * as base from './base.js'

// #region Setup
const sdkInstance = Object.create(globalSdk)
await base.authenticateUser(sdkInstance)
const project = await base.createAndGetProject(true, sdkInstance)
// #endregion

// #region Tests
test('getDnsRecord should succeed', async t => {
  const expectedResponse = {
    success: true,
    exists: false,
    message: 'No DNS record found for this domain'
  }
  const actualResponse = await sdkInstance.getDnsRecord(project.key)

  t.deepEqual(
    expectedResponse,
    actualResponse,
    'Successful response from DNS Record call'
  )

  t.end()
})

test('createDnsRecord should succeed', async t => {
  const expectedData = {
    success: true,
    name: project.key,
    type: 'CNAME',
    content: 'router.symbo.ls'
  }
  const response = await sdkInstance.createDnsRecord(project.key)
  const actualData = {
    success: response.success,
    name: response.record.name,
    type: response.record.type,
    content: response.record.content
  }

  t.deepEqual(
    actualData,
    expectedData,
    'Actual response data matches expected data.'
  )

  t.end()
})

test('removeDnsRecord should succeed', async t => {
  const tempProject = await base.createAndGetProject(true, sdkInstance)
  const createResponse = await sdkInstance.createDnsRecord(tempProject.key)
  const expectedData = {
    success: true,
    domain: createResponse.record.name,
    recordId: createResponse.record.id
  }
  const actualData = await sdkInstance.removeDnsRecord(tempProject.key)
  t.deepEqual(
    actualData,
    expectedData,
    'Actual response data matches expected response data.'
  )
  t.end()
})
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
