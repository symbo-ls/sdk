import { createRandomPassword } from '../base.js'
import { faker } from '@faker-js/faker'

export const dataSets = {
  emptyEmail: {
    email: '',
    password: createRandomPassword(),
    title: 'Login failed: Identifier and Password required',
    error: 'Login failed: [users:login] Identifier and Password required.'
  },
  emptyPassword: {
    email: faker.internet.email().toLowerCase(),
    password: '',
    title: 'Login failed: Identifier and Password required',
    error: 'Login failed: [users:login] Identifier and Password required.'
  },
  wrongPassword: {
    email: globalUser.email,
    password: 'wrong-password',
    title: 'Login failed: Wrong password',
    error:
      'Login failed: [users:login] Invalid password. Please reset your password if you forgot it..'
  },
  invalidCreds: {
    email: faker.internet.email().toLowerCase(),
    password: createRandomPassword(),
    title: 'Invalid Credentials Test',
    error: 'Login failed: [users:login] Invalid credentials.'
  }
}
