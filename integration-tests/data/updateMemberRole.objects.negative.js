export const dataSets = {
  projectIdRequired: {
    projectId: '',
    userId: globalUser.userId,
    role: 'admin',
    title: 'Failed to update member role: Project ID is required',
    error: 'Project ID is required'
  },
  userIdRequired: {
    projectId: globalProject.id,
    userId: '',
    role: 'admin',
    title: 'Failed to update member role: User ID is required',
    error: 'User ID is required'
  },
  invalidRole: {
    projectId: globalProject.id,
    userId: globalUser.userId,
    role: 'invalid-role',
    title: 'Failed to update member role: Invalid role',
    error: 'Invalid role: invalid-role'
  },
  membershipNotFound: {
    projectId: globalProject.id,
    userId: 'notInProject',
    role: 'admin',
    title: 'Failed to update member role: Membership not found.',
    error:
      'Failed to update member role: [projects:update-member-role] Membership not found.'
  },
  cannoModifyYourRole: {
    projectId: globalProject.id,
    userId: globalUser.userId,
    role: 'admin',
    title: 'Attempt cannot modify your own role.',
    error:
      'Failed to update member role: [projects:update-member-role] You cannot modify your own role.'
  }
}
