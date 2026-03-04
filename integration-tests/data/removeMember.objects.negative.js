export const dataSets = {
  projectIdRequired: {
    projectId: undefined,
    userId: globalUser.user.id,
    title: 'Failed to remove member: Project ID is required',
    error: 'Project ID and member ID are required'
  },
  userIdRequired: {
    projectId: globalProject.id,
    userId: undefined,
    title: 'Failed to remove member: User ID is required',
    error: 'Project ID and member ID are required'
  },
  AuthorizeRejectedAccess: {
    projectId: globalProject.id,
    userId: 'incorrect userID',
    title: 'Failed to remove member: Member not found in project',
    error:
      'Failed to remove member: Request failed: Cast to ObjectId failed for value "incorrect userID" (type string) at path "_id" for model "ProjectMember"'
  }
}
