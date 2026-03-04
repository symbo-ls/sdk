export const dataSets = {
  requestUndefined: {
    request: null,
    title: 'null request is not accepted',
    error: "Cannot destructure property 'projectId' of 'options' as it is null."
  },
  projectIdRequired: {
    request: {
      projectId: ''
    },
    title: 'Project ID is required for checkout',
    error: 'Project ID is required for checkout'
  },
  invalidPackage: {
    request: {
      projectId: global.globalProject.id,
      pkg: 4
    },
    title: 'Invalid Package',
    error:
      'Failed to checkout: Request failed: Project ID, Plan ID, and Pricing Key are required'
  },
  invalidRequest: {
    request: {
      projectId: global.globalProject.id
    },
    title: 'Invalid request',
    error:
      'Failed to checkout: Request failed: Project ID, Plan ID, and Pricing Key are required'
  }
}
