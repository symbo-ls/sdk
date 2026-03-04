export const dataSets = {
  emptyToken: {
    token: '',
    title: 'Google auth failed: Google ID token is required',
    error:
      'Google auth failed: Request failed: Google ID token is required'
  },
  invalidToken: {
    token: 'invalid-token',
    title:
      'Google auth failed: Wrong number of segments in token: invalid-token',
    error:
      'Google auth failed: Request failed: Google authentication failed: Wrong number of segments in token: invalid-token'
  }
}
