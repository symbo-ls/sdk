import { BaseValidator } from './base'

export class ComponentValidator extends BaseValidator {
  constructor (data) {
    super()
    this.data = data
  }

  validateName () {
    const { key } = this.data

    // const { key, title } = this.data
    // if (!title) {
    //   this.addError('title', 'Title is required')
    // }

    if (!key) {
      this.addError('key', 'Key is required')
    } else if (!/^[A-Z][a-zA-Z0-9]*$/u.test(key)) {
      this.addError(
        'key',
        'Key must start with capital letter and contain only letters and numbers'
      )
    }

    return this
  }

  validateCode () {
    const { code } = this.data

    try {
      // Basic syntax validation
      new Function(code) // eslint-disable-line
    } catch (e) {
      this.addError('code', `Invalid JavaScript syntax: ${e.message}`)
    }

    // Check for potentially dangerous code
    const dangerousPatterns = ['eval\\(', 'document\\.write', 'innerHTML']

    const dangerousRegex = new RegExp(dangerousPatterns.join('|'), 'iu')
    if (dangerousRegex.test(code)) {
      this.addError('code', 'Code contains potentially unsafe operations')
    }

    return this
  }

  validateAll () {
    return this.validateName()
    // .validateCode()
  }
}
