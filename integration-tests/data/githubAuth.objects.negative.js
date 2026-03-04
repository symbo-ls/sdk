export const dataSets = {
  emptyToken: {
    token: '',
    title: 'GitHub auth failed: GitHub authorization code is required',
    error:
      'GitHub auth failed: Request failed: GitHub authorization code is required'
  },
  invalidToken: {
    token: 'invalid-token',
    title: 'GitHub auth failed: Failed to get GitHub access token',
    error:
      'GitHub auth failed: Request failed: GitHub authentication failed: GitHub token error: The code passed is incorrect or expired.'
  }
}
