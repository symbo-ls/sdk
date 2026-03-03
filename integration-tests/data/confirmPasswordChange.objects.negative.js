export const dataSets = {
  verificationCodeRequired: {
    verificationCode: '',
    newPassword: 'password.123',
    confirmPassword: 'password.123',
    title: 'Failed to confirm password change: Verification code is required',
    error:
      'Failed to confirm password change: Function call failed: [users:confirm-password-change] Verification code, new password, and confirmation are required.'
  },
  newPasswordRequired: {
    verificationCode: 'some-verification-code',
    newPassword: '',
    confirmPassword: 'password.123',
    title: 'Failed to confirm password change: New Password is required',
    error:
      'Failed to confirm password change: Function call failed: [users:confirm-password-change] Verification code, new password, and confirmation are required.'
  },
  confirmPasswordRequired: {
    verificationCode: 'some-verification-code',
    newPassword: 'password.123',
    confirmPassword: '',
    title: 'Failed to confirm password change: Confirm Password is required',
    error:
      'Failed to confirm password change: Function call failed: [users:confirm-password-change] Verification code, new password, and confirmation are required.'
  },
  passwordsDoNotMatch: {
    verificationCode: 'some-verification-code',
    newPassword: 'password.123',
    confirmPassword: 'password.12',
    title: 'Failed to confirm password change: Passwords do not match',
    error:
      'Failed to confirm password change: Function call failed: [users:confirm-password-change] New password and confirmation do not match.'
  },
  invalidVerificationCode: {
    verificationCode: 'some-verification-code',
    newPassword: 'Password.123#',
    confirmPassword: 'Password.123#',
    title: 'Failed to confirm password change: Invalid verification code',
    error:
      'Failed to confirm password change: Function call failed: [users:confirm-password-change] Invalid verification code.'
  }
}
