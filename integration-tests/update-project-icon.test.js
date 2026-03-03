import test from 'tape'
import { createAndGetProject, authenticateUser } from './base.js'
import { projectIconDataSets } from './data/updateProjectIcon.objects.negative.js'

test('updateProjectIcon executed with success', async t => {
  const sdkInstance = Object.create(globalSdk)
  await authenticateUser(sdkInstance)
  const project = await createAndGetProject(true, sdkInstance)
  sdkInstance.updateContext({ appKey: project.key })

  const icon = await sdkInstance.uploadFile('./data/test-icon.png')
  t.ok(icon, 'Icon uploaded successfully')

  const response = await sdkInstance.updateProjectIcon(project.id, icon)
  t.equal(response.success, true, 'Project icon is updated successfully')

  const updatedProject = await sdkInstance.call('projects:get', {
    projectId: project.id,
    fields: {
      icon: true
    }
  })

  t.ok(updatedProject, 'Project was fetched after update')
  t.ok(updatedProject.icon, 'Project has an icon field')
  t.equal(
    updatedProject.icon,
    icon.id,
    'Project icon was correctly updated and persisted'
  )
})

Object.keys(projectIconDataSets).forEach(key => {
  test(`updateProjectIcon fails with ${projectIconDataSets[key].title}`, async t => {
    const sdkInstance = Object.create(globalSdk)
    await authenticateUser(sdkInstance)
    const project = await createAndGetProject(true, sdkInstance)

    const { error } = projectIconDataSets[key]

    try {
      const response = await sdkInstance.updateProjectIcon(
        project.id,
        projectIconDataSets[key].icon
      )
      t.fail(
        `Project icon update did not fail as expected. Response = ${JSON.stringify(
          response
        )}`
      )
    } catch (e) {
      t.equal(e.message, error, 'Actual error matches Expected error.')
    }
    t.end()
  })
})

test.onFinish(() => process.exit(0))
