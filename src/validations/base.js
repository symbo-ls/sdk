export class BaseValidator {
  constructor () {
    this.errors = {}
  }

  addError (field, message) {
    if (!this.errors[field]) {
      this.errors[field] = []
    }
    this.errors[field].push(message)
  }

  hasErrors () {
    return Object.keys(this.errors).length > 0
  }

  getErrors () {
    return this.errors
  }

  // Chain validators
  and (validator) {
    const combinedErrors = { ...this.errors }
    const otherErrors = validator.getErrors()

    Object.keys(otherErrors).forEach(key => {
      if (!combinedErrors[key]) {
        combinedErrors[key] = []
      }
      combinedErrors[key].push(...otherErrors[key])
    })

    this.errors = combinedErrors
    return this
  }
}
