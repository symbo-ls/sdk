import { BaseValidator } from './base'

export class FunctionValidator extends BaseValidator {
  constructor (data) {
    super()
    this.data = data
  }

  validateName () {
    const { key } = this.data

    if (!key) {
      this.addError('key', 'Function name is required')
    } else if (!/^[a-z][a-zA-Z_]*$/u.test(key)) {
      this.addError(
        'key',
        'Function name must start with lowercase letter and contain only letters and underscores'
      )
    }

    return this
  }

  validateValue () {
    const { value } = this.data

    if (!value) {
      this.addError('value', 'Function implementation is required')
    } else if (typeof value !== 'function') {
      this.addError('value', 'Value must be a function')
    }

    // Check for potentially dangerous code patterns
    if (value && value.toString) {
      const functionString = value.toString()
      const dangerousPatterns = [
        'eval\\(',
        // 'Function\\(',
        'document\\.write',
        'innerHTML'
      ]
      const dangerousRegex = new RegExp(dangerousPatterns.join('|'), 'iu')

      if (dangerousRegex.test(functionString)) {
        this.addError(
          'value',
          'Function contains potentially unsafe operations'
        )
      }
    }

    return this
  }

  validateAll () {
    return this.validateName().validateValue()
  }
}
