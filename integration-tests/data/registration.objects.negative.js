import { faker } from '@faker-js/faker'
import { createRandomPassword } from '../base.js'

const email = faker.internet.email()
const name = faker.person.firstName()
const password = createRandomPassword()

export const userDataSets = {
  nullEmail: {
    email: null,
    password,
    name,
    callbackUrl: 'https://example.com',
    error:
      'Registration failed: Request failed: Name, email, and password are required'
  },
  emptyPassword: {
    email,
    password: '',
    name,
    callbackUrl: 'https://example.com',
    error:
      'Registration failed: Request failed: Name, email, and password are required'
  },
  missingName: {
    email,
    password,
    name: undefined,
    callbackUrl: 'https://example.com',
    error:
      'Registration failed: Request failed: Name, email, and password are required'
  },
  emptyArrayName: {
    name: [],
    email,
    password,
    callbackUrl: 'https://example.com',
    error: 'Registration failed: Request failed: User validation failed: name: Cast to string failed for value "[]" (type Array) at path "name"'
  }
}
