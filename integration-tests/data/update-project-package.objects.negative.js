export const dataSets = {
  projectIdRequired: {
    projectId: '',
    package: 1,
    title: 'empty string for project ID',
    error:
      'Project ID is required'
  },
  invalidPackage: {
    projectId: globalProject.id,
    package: 7,
    title: 'invalid package value',
    error:
      'Failed to update project package: Request failed: Package must be one of: 0, 1, 2, 3, 4, 5, 6'
  }
}
