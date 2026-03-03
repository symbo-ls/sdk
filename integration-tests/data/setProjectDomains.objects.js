export const negativeDataSets = {
  projectIdRequired: {
    projectId: '',
    domains: {
      development: {
        domain: 'http://localhost:3000',
        cname: 'localhost'
      }
    },
    title: 'Project Id is required',
    error: 'Project ID is required'
  },
  projectIdAndDomainsRequired: {
    projectId: globalProject.id,
    domains: null,
    title: 'ProjectId and domains are required',
    error:
      'Failed to set project domains: Function call failed: [projects:update-domains] ProjectId and domains are required.'
  },
  failedToSetup: {
    projectId: globalProject.id,
    domains: {
      development: {
        domain: 'http://localhost:3000',
        cname: 'localhost'
      }
    },
    title: 'Failed to setup domain infrastructure',
    error:
      'Failed to set project domains: Function call failed: [projects:update-domains] Failed to setup domain infrastructure.'
  }
}
