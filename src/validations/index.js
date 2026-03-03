import { ComponentValidator } from './component.js'
import { PageValidator } from './page.js'
import { FunctionValidator } from './function.js'
import { FileValidator } from './file.js'
import { DependencyValidator } from './dependencies.js'

export const validators = {
  components: ComponentValidator,
  pages: PageValidator,
  functions: FunctionValidator,
  files: FileValidator,
  dependencies: DependencyValidator
}

export function validate (type, data) {
  // Convert singular to plural if needed
  const pluralType = type.endsWith('s') ? type : `${type}s`

  const Validator = validators[pluralType]
  if (!Validator) {
    throw new Error(`No validator found for type: ${type}`)
  }

  return new Validator(data).validateAll()
}
