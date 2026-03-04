export const dataSets = {
  projectIdRequired: {
    projectId: '',
    userId: globalUser.user.id,
    role: 'admin',
    title: 'Failed to update member role: Project ID is required',
    error: 'Project ID, member ID, and role are required'
  },
  userIdRequired: {
    projectId: globalProject.id,
    userId: '',
    role: 'admin',
    title: 'Failed to update member role: User ID is required',
    error: 'Project ID, member ID, and role are required'
  },
  invalidRole: {
    projectId: globalProject.id,
    userId: globalUser.user.id,
    role: 'invalid-role',
    title: 'Failed to update member role: Invalid role',
    error: 'Failed to update member role: Request failed: Role must be one of: guest, editor, admin, owner'
  },
  membershipNotFound: {
    projectId: globalProject.id,
    userId: 'notInProject',
    role: 'admin',
    title: 'Failed to update member role: Membership not found.',
    error:
      'Failed to update member role: Request failed: Cast to ObjectId failed for value "notInProject" (type string) at path "_id" for model "ProjectMember"'
  },
  cannoModifyYourRole: {
    projectId: globalProject.id,
    userId: globalProject.members[0].id,
    role: 'admin',
    title: 'Attempt cannot modify your own role.',
    error:
      'Failed to update member role: [projects:update-member-role] You cannot modify your own role.'
  }
}
