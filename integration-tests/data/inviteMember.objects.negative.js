export const dataSets = {
  projectIdRequired: {
    projectId: '',
    email: globalProject.members[0].user.email,
    role: globalProject.members[0].role,
    name: globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Project ID is required',
    error: 'Project ID is required'
  },
  emailRequired: {
    projectId: globalProject.id,
    email: '',
    role: globalProject.members[0].role,
    name: globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Email is required',
    error: 'Email is required'
  },
  callbackUrlRequired: {
    projectId: globalProject.id,
    email: globalProject.members[0].user.email,
    role: globalProject.members[0].role,
    name: globalProject.members[0].user.name,
    callbackUrl: {},
    title: 'Failed to invite member: Callback Url is required',
    error: 'Callback Url is required'
  },
  invalidRole: {
    projectId: globalProject.id,
    email: globalProject.members[0].user.email,
    role: 'invalid-role',
    name: globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Invalid role: invalid-role',
    error: 'Invalid role: invalid-role'
  }
}
