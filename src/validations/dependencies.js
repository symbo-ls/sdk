/* eslint-disable require-unicode-regexp */
/* eslint-disable prefer-named-capture-group */
import { BaseValidator } from './base'

export class DependencyValidator extends BaseValidator {
  constructor (data) {
    super()
    this.data = data
  }

  validateName () {
    const { key } = this.data

    if (!key) {
      this.addError('name', 'Package name is required')
    } else if (
      !/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(key)
    ) {
      this.addError('name', 'Invalid package name format')
    }

    return this
  }

  validateVersion () {
    const { value } = this.data

    if (value) {
      // Validates semantic versioning patterns including ranges
      const semverRegex =
        /^([\^~]|>=|<=|>|<)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
      const rangeRegex =
        /^(\*|x|X|\d+\.x|\d+\.\*|\d+\.X|\d+\.\d+\.x|\d+\.\d+\.\*|\d+\.\d+\.X)$/

      if (!semverRegex.test(value) && !rangeRegex.test(value)) {
        this.addError('version', 'Invalid version format')
      }
    } else {
      this.addError('version', 'Package version is required')
    }

    return this
  }

  validateDependencyType () {
    const { type } = this.data

    if (type) {
      const allowedTypes = [
        'dependency',

        //
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
        'bundledDependencies'
      ]

      if (!allowedTypes.includes(type)) {
        this.addError('type', `Invalid dependency type: "${type}"`)
      }
    } else {
      this.addError('type', 'Dependency type is required')
    }

    return this
  }

  validateRegistry () {
    const { registry } = this.data

    if (registry) {
      try {
        const url = new URL(registry)
        const allowedProtocols = ['http:', 'https:']

        if (!allowedProtocols.includes(url.protocol)) {
          this.addError(
            'registry',
            'Registry URL must use HTTP or HTTPS protocol'
          )
        }
      } catch (e) {
        this.addError(
          'registry',
          `Invalid registry URL format, error: ${e.message}`
        )
      }
    }

    return this
  }

  validateGitDependency () {
    const { value } = this.data

    if (value && value.startsWith('git')) {
      const gitUrlRegex = /^git(?:\+(?:https?|ssh|file)):\/\/[^\s]+$/
      const githubRegex =
        /^(?:github:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#.+)?$/

      if (!gitUrlRegex.test(value) && !githubRegex.test(value)) {
        this.addError('version', 'Invalid Git dependency format')
      }
    }

    return this
  }

  validateAll () {
    return this.validateName()
      .validateVersion()
      .validateDependencyType()
      .validateRegistry()
      .validateGitDependency()
  }
}
