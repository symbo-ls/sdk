export const dataSets = {
  projectIdRequired: {
    projectId: '',
    email: global.globalProject.members[0].user.email,
    role: global.globalProject.members[0].role,
    name: global.globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Project ID is required',
    error: 'Project ID, email, and role are required'
  },
  emailRequired: {
    projectId: global.globalProject.id,
    email: '',
    role: global.globalProject.members[0].role,
    name: global.globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Email is required',
    error: 'Project ID, email, and role are required'
  },
  alreadyHasOwner: {
    projectId: global.globalProject.id,
    email: global.globalProject.members[0].user.email,
    role: global.globalProject.members[0].role,
    name: global.globalProject.members[0].user.name,
    callbackUrl: {},
    title: 'Failed to invite member: Project already has owner',
    error:
      'Failed to invite member: Request failed: Project already has an owner. Use transferOwnership to change ownership.'
  },
  invalidRole: {
    projectId: global.globalProject.id,
    email: global.globalProject.members[0].user.email,
    role: 'invalid-role',
    name: global.globalProject.members[0].user.name,
    callbackUrl: { url: 'test.com' },
    title: 'Failed to invite member: Invalid role: invalid-role',
    error:
      'Failed to invite member: Request failed: Invalid role: invalid-role. Must be one of: guest, editor, admin, owner'
  }
}
