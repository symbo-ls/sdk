import { BaseValidator } from './base'

export class PageValidator extends BaseValidator {
  constructor (data) {
    super()
    this.data = data
  }

  validatePath () {
    const { key } = this.data

    if (!key) {
      this.addError('key', 'Path is required')
    } else if (!key.startsWith('/')) {
      this.addError('key', 'Path must start with /')
    }

    return this
  }

  validateAll () {
    return this.validatePath()
  }
}
