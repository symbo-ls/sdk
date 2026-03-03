export const dataSets = {
  projectIdRequired: {
    projectId: '',
    tier: 'free',
    title: 'Failed to update project tier: Project ID is required',
    error: 'Project ID is required'
  },
  invalidTier: {
    projectId: globalProject.id,
    tier: 'invalid-tier',
    title: 'Failed to update project tier: Invalid project tier',
    error: 'Invalid project tier: invalid-tier'
  }
}
