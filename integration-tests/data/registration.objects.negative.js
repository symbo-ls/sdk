import { faker } from '@faker-js/faker'
import { createRandomPassword } from '../base.js'

const email = faker.internet.email()
const name = faker.person.firstName()
const password = createRandomPassword()

export const userDataSets = {
  nullEmail: {
    email: null,
    password: password,
    name,
    callbackUrl: 'https://example.com',
    error:
      'Registration failed: [users:register] Email, Password and callbackUrl required.'
  },
  emptyPassword: {
    email,
    password: '',
    name,
    callbackUrl: 'https://example.com',
    error:
      'Registration failed: [users:register] Email, Password and callbackUrl required.'
  },
  emptyArrayName: {
    name: [],
    email,
    password: password,
    callbackUrl: 'https://example.com',
    error: 'Registration failed: [users:register] Name must be a string.'
  },
  intCallbackUrl: {
    email,
    password: password,
    name,
    callbackUrl: 12,
    error: 'Registration failed: [users:register] Invalid callbackUrl format.'
  }
}
