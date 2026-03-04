export const dataSets = {
  invalidID: {
    id: 'incorrectID',
    error: 'Failed to remove favorite project: Request failed: Cast to ObjectId failed for value "incorrectID" (type string) at path "favoriteProjects" because of "BSONError"'
  },
  missingID: {
    id: undefined,
    error: 'Project ID is required'
  }
}
