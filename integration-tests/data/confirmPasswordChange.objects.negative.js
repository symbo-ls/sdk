export const dataSets = {
  incorrectCode: {
    verificationCode: 'some-verification-code',
    newPassword: 'Password123',
    currentPassword: process.env.GUEST_PASSWORD,
    title: 'Special character is required',
    error:
      'Password change confirmation failed: Request failed: Password change code is invalid or has expired'
  },
  uppercaseCharacterRequired: {
    verificationCode: undefined,
    newPassword: 'password&123',
    currentPassword: process.env.GUEST_PASSWORD,
    title: 'Uppercase character is required',
    error:
      'Password change confirmation failed: Request failed: Password must contain at least one uppercase letter'
  },
  specialCharacterRequired: {
    verificationCode: undefined,
    newPassword: 'Password123',
    currentPassword: process.env.GUEST_PASSWORD,
    title: 'Special character is required',
    error:
      'Password change confirmation failed: Request failed: Password must contain at least one special character (@$!%*?&)'
  },
  currentPasswordRequired: {
    verificationCode: undefined,
    newPassword: 'Password123',
    currentPassword: undefined,
    title: 'Current password is required',
    error:
      'Password change confirmation failed: Request failed: Current password and new password are required'
  },
  newPasswordRequired: {
    verificationCode: undefined,
    newPassword: undefined,
    currentPassword: 'Password123',
    title: 'New password is required',
    error:
      'Password change confirmation failed: Request failed: Current password and new password are required'
  }
}
