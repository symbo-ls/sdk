import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

// JavaScript reserved keywords
const RESERVED_KEYWORDS = [
  'abstract',
  'arguments',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield'
]

const CODE_TYPES = ['snippets', 'functions']

// Helper function to check for reserved keywords in code string
const checkCodeForReservedKeywords = code => {
  try {
    // Clean up the code string - replace encoded newlines
    const cleanCode = code.replace(/\/\/\/\/\/n/gu, '\n')

    // Parse the code string to get AST, with more permissive options
    const ast = acorn.parse(cleanCode, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReserved: true
    })

    // Function to check declarations in the AST
    const findReservedDeclarations = node => {
      // Check function declarations (including function parameters)
      if (node.type === 'FunctionDeclaration') {
        const name = node.id?.name
        if (name && RESERVED_KEYWORDS.includes(name)) {
          throw new Error(
            `Found reserved keyword "${name}" used as function name`
          )
        }

        // Check function parameters
        node.params.forEach(param => {
          if (
            param.type === 'Identifier' &&
            RESERVED_KEYWORDS.includes(param.name)
          ) {
            throw new Error(
              `Found reserved keyword "${param.name}" used as parameter name`
            )
          }
        })
      }

      // Check variable declarations
      if (node.type === 'VariableDeclarator') {
        const name = node.id?.name
        if (name && RESERVED_KEYWORDS.includes(name)) {
          throw new Error(
            `Found reserved keyword "${name}" used as variable name`
          )
        }
      }

      // Check variable declarations in object patterns
      if (
        node.type === 'Identifier' &&
        node.parent?.type === 'VariableDeclarator'
      ) {
        if (RESERVED_KEYWORDS.includes(node.name)) {
          throw new Error(
            `Found reserved keyword "${node.name}" used as variable name`
          )
        }
      }
    }

    // Walk through the AST with more comprehensive checks
    walk.full(ast, node => {
      findReservedDeclarations(node)
    })
  } catch (error) {
    // If it's a parsing error, it's likely not related to reserved keywords
    if (error.message.includes('reserved keyword')) {
      throw error
    }
    // Otherwise, the code is likely valid but couldn't be parsed for other reasons
    // We'll allow it to pass since we're only checking for reserved keywords
    return true
  }
}

export const validateParams = {
  type: type => {
    if (!type) {
      throw new Error('Type parameter is required')
    }
    if (typeof type !== 'string') {
      throw new Error('Type must be a string')
    }
    return true
  },

  key: (key, type) => {
    if (!key) {
      throw new Error('Key parameter is required')
    }
    if (typeof key !== 'string') {
      throw new Error('Key must be a string')
    }

    // Check for reserved keywords if type is code-related
    if (CODE_TYPES.includes(type) && RESERVED_KEYWORDS.includes(key)) {
      throw new Error(
        `Key "${key}" is a reserved JavaScript keyword and cannot be used`
      )
    }

    return true
  },

  data: (data, type) => {
    if (!data) {
      throw new Error('Data parameter is required')
    }
    if (typeof data !== 'object') {
      throw new Error('Data must be an object')
    }
    if (!data.key) {
      throw new Error('Data must contain a key property')
    }
    if (!data.value) {
      throw new Error('Data must contain a value property')
    }

    // Check key against reserved keywords for code-related types
    if (CODE_TYPES.includes(type)) {
      if (RESERVED_KEYWORDS.includes(data.key)) {
        throw new Error(
          `Key "${data.key}" is a reserved JavaScript keyword and cannot be used`
        )
      }

      // Check code content if present
      if (data.value) {
        const codeToCheck = data.value
        if (typeof codeToCheck === 'string') {
          checkCodeForReservedKeywords(codeToCheck)
        }
      }
    }

    return true
  }
}
