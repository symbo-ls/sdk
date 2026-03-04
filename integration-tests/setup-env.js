import dotenv from 'dotenv'

dotenv.config()

if (!process.env.SYMBOLS_APP_ENV) {
  process.env.SYMBOLS_APP_ENV = 'testing'
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

