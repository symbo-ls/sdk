export const dataSets = {
  projectIdRequired: {
    projectId: '',
    title: 'Failed to remove project: Project ID is required',
    error: 'Project ID is required'
  },
  projectDoesNotExists: {
    projectId: 'non-existing-project-id',
    title: 'Failed to remove project: Incorrect project ID',
    error:
      'Failed to remove project: Request failed: Cast to ObjectId failed for value "non-existing-project-id" (type string) at path "_id" for model "Project"'
  }
}
