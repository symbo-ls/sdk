export const dataSets = {
  emptyToken: {
    token: '',
    title: 'Registration confirmation failed: Invalid request',
    error:
      'Registration confirmation failed: [users:register-confirmation] Invalid request.'
  },
  invalidToken: {
    token: 'invalid-token',
    title: 'Registration confirmation failed: JsonWebTokenError jwt malformed',
    error:
      'Registration confirmation failed: [users:register-confirmation] [JsonWebTokenError] jwt malformed.'
  }
}
