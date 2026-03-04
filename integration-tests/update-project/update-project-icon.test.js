import test from 'tape'
import { createAndGetProject, authenticateUser } from '../base.js'
import { projectIconDataSets } from '../data/updateProjectIcon.objects.negative.js'
import fs from 'node:fs'
import { Blob } from 'node:buffer'

const sdkInstance = Object.create(globalSdk)
await authenticateUser(sdkInstance)

test('updateProjectIcon executed with success', async t => {
  const project = await createAndGetProject(true, sdkInstance)
  sdkInstance.updateContext({ appKey: project.key })

  const buffer = fs.readFileSync('./integration-tests/data/test-icon.png')
  const file = new Blob([buffer], { type: 'image/png' })
  file.name = 'logo.png'
  const icon = await sdkInstance.uploadFile(file)
  t.ok(icon, 'Icon uploaded successfully')

  const response = await sdkInstance.updateProjectIcon(project.id, file)
  t.ok(response, 'Project icon is updated successfully')

  const updatedProject = await sdkInstance.getProject(project.id)
  t.ok(updatedProject, 'Project was fetched after update')
  t.ok(updatedProject.icon, 'Project has an icon field')
  t.equal(
    updatedProject.icon.tags[0],
    'project-icon',
    'Project icon was correctly updated and persisted'
  )
})

Object.keys(projectIconDataSets).forEach(key => {
  test(`updateProjectIcon fails with ${projectIconDataSets[key].title}`, async t => {
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
