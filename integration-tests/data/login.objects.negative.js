import { createRandomPassword } from '../base.js'
import { faker } from '@faker-js/faker'

export const dataSets = {
  emptyEmail: {
    email: '',
    password: createRandomPassword(),
    title: 'Empty Email',
    error:
      'Login failed: Request failed: Email/username and password are required'
  },
  emptyPassword: {
    email: faker.internet.email().toLowerCase(),
    password: '',
    title: 'Empty Password',
    error: 'Login failed: Request failed: Email/username and password are required'
  }
}
