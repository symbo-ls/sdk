export const dataSets = {
  projectIdRequired: {
    projectId: '',
    data: {},
    title: 'Failed to update project: ProjectId is required',
    error:
      'Project ID is required'
  },
  dataReuired: {
    projectId: globalProject.id,
    data: null,
    title: 'Failed to update project: Data are required',
    error:
      'Failed to update project: Request failed: HTTP 400: Bad Request'
  }
}
