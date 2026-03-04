export const dataSets = {
  requestPasswordReset_emptyEmail: {
    email: '',
    callbackUrl: 'https://test.com',
    title: 'Password reset request failed: Email and callbackUrl are required',
    error:
      'Password reset request failed: Request failed: Email is required'
  },
  requestPasswordReset_emptyCallbackUrl: {
    email: 'test@symbols.app',
    callbackUrl: '',
    title: 'Password reset request failed: Email and callbackUrl are required',
    error:
      'Password reset request failed: Request failed: No account found with that email'
  },
  confirmPasswordReset_emptyToken: {
    token: '',
    password: 'test123',
    title:
      'Password reset confirmation failed: Token and new password are required',
    error:
      'Password reset confirmation failed: Request failed: Token and new password are required'
  },
  confirmPasswordReset_emptyPassword: {
    token: 'token123',
    password: '',
    title:
      'Password reset confirmation failed: Token and new password are required',
    error:
      'Password reset confirmation failed: Request failed: Token and new password are required'
  },
  confirmPasswordReset_invalidPassword: {
    token: 'token123',
    password: 'invalidpass',
    title:
      'Password reset confirmation failed: Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    error:
      'Password reset confirmation failed: Request failed: Password must contain at least one uppercase letter,Password must contain at least one number,Password must contain at least one special character (@$!%*?&)'
  }
}
