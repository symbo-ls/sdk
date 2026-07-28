import { createRandomPassword } from '../base.js'
import { faker } from '@faker-js/faker'

// NOTE on the expected strings: an HTTP error response carries `.status`,
// and `BaseService._request` deliberately does NOT re-wrap those —
// `error?.status !== undefined ? error : _wrapRequestError(error, url)`
// (BaseService.js). Only genuine transport failures (no status) pick up the
// `Request failed: ` / `Network unreachable for …` diagnostic prefix. So a
// 400 from the server surfaces its own message verbatim, and AuthService
// adds exactly one `Login failed: ` wrap on top. These fixtures used to
// expect the doubly-wrapped `Login failed: Request failed: …` form from
// before that split landed (sdk 4e50b16, 2026-07-25).
export const dataSets = {
  emptyEmail: {
    email: '',
    password: createRandomPassword(),
    title: 'Empty Email',
    error: 'Login failed: Email/username and password are required'
  },
  emptyPassword: {
    email: faker.internet.email().toLowerCase(),
    password: '',
    title: 'Empty Password',
    error: 'Login failed: Email/username and password are required'
  }
}
