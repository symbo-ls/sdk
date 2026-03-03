export const dataSets = {
  projectIdRequired: {
    projectId: '',
    data: {},
    title: 'Failed to update project: ProjectId is required',
    error:
      'Failed to update project: Function call failed: [projects:update] Authorize rejected access.'
  },
  dataReuired: {
    projectId: globalProject.id,
    data: null,
    title: 'Failed to update project: Data are required',
    error:
      'Failed to update project: Function call failed: [projects:update] ProjectId and data are required.'
  }
}
