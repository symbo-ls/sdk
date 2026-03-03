export const dataSets = {
  projectIdRequired: {
    projectId: '',
    package: 1,
    title: 'empty string for project ID',
    error:
      'Failed to update project package: Function call failed: [projects:update] Authorize rejected access.'
  },
  invalidPackage: {
    projectId: globalProject.id,
    package: 7,
    title: 'invalid package value',
    error:
      'Failed to update project package: Function call failed: [projects:update] Invalid package value. Must be an integer between 0 and 6.'
  }
}
