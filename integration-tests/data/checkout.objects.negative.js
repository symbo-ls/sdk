export const dataSets = {
  requestUndefined: {
    request: null,
    title: 'null request is not accepted',
    error:
      "Cannot destructure property 'projectId' of 'object null' as it is null."
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
      projectId: globalProject.id,
      pkg: 4
    },
    title: 'Invalid package type: 4',
    error: 'Invalid package type: 4'
  },
  invalidRequest: {
    request: {
      projectId: globalProject.id
    },
    title: 'Invalid request',
    error:
      'Failed to checkout: Function call failed: [checkout] Failed to create checkout session.'
  }
}
