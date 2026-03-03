import { isDevelopment } from '@domql/utils'

// Base configuration with defaults and environment-specific overrides
const CONFIG = {
  // Common defaults for all environments
  common: {
    // NOTE: Google client id for google auth, need to configure URLs for each environment in Google console
    googleClientId:
      '686286207466-bvd2fqs31rlm64fgich7rtpnc8ns2tqg.apps.googleusercontent.com',
    // Feature toggles that apply across all environments by default
    features: {
      newUserOnboarding: true,
      betaFeatures: false
    }
  },

  // Environment-specific configurations

  local: {
    // local
    socketUrl: 'http://localhost:8080', // For socket api
    apiUrl: 'http://localhost:8080', // For server api
    basedEnv: 'development', // For based api
    basedProject: 'platform-v2-sm', // For based api
    basedOrg: 'symbols', // For based api
    githubClientId: 'Ov23liHxyWFBxS8f1gnF', // For github api
    // Environment-specific feature toggles (override common)
    features: {
      betaFeatures: true // Enable beta features in local dev
    }
  },
  development: {
    socketUrl: 'https://dev.api.symbols.app',
    apiUrl: 'https://dev.api.symbols.app',
    githubClientId: 'Ov23liHxyWFBxS8f1gnF'
  },
  testing: {
    socketUrl: 'https://test.api.symbols.app',
    apiUrl: 'https://test.api.symbols.app',
    basedEnv: 'testing',
    basedProject: 'platform-v2-sm',
    basedOrg: 'symbols',
    githubClientId: 'Ov23liHxyWFBxS8f1gnF'
  },
  upcoming: {
    socketUrl: 'https://upcoming.api.symbols.app',
    apiUrl: 'https://upcoming.api.symbols.app',
    githubClientId: 'Ov23liWF7NvdZ056RV5J'
  },
  staging: {
    socketUrl: 'https://staging.api.symbols.app',
    apiUrl: 'https://staging.api.symbols.app',
    basedEnv: 'staging',
    basedProject: 'platform-v2-sm',
    basedOrg: 'symbols',
    githubClientId: 'Ov23ligwZDQVD0VfuWNa'
  },
  production: {
    socketUrl: 'https://api.symbols.app',
    apiUrl: 'https://api.symbols.app',
    basedEnv: 'production',
    basedProject: 'platform-v2-sm',
    basedOrg: 'symbols',
    githubClientId: 'Ov23liFAlOEIXtX3dBtR'
  }
}

// Determine environment with error handling
const getEnvironment = () => {
  // @preserve-env
  const env = process.env.SYMBOLS_APP_ENV || process.env.NODE_ENV

  // Validate that the environment exists in our config
  if (!CONFIG[env]) {
    throw new Error(`Unknown environment "${env}"`)
  }

  return env
}

// Get configuration with environment variable overrides and error handling
export const getConfig = () => {
  try {
    const env = getEnvironment()
    const envConfig = { ...CONFIG.common, ...CONFIG[env] }

    // Create the final config with environment variable overrides
    const finalConfig = {
      ...envConfig,
      socketUrl: process.env.SYMBOLS_APP_SOCKET_URL || envConfig.socketUrl,
      apiUrl: process.env.SYMBOLS_APP_API_URL || envConfig.apiUrl,
      basedEnv: process.env.SYMBOLS_APP_BASED_ENV || envConfig.basedEnv,
      basedProject:
        process.env.SYMBOLS_APP_BASED_PROJECT || envConfig.basedProject,
      basedOrg: process.env.SYMBOLS_APP_BASED_ORG || envConfig.basedOrg,
      githubClientId:
        process.env.SYMBOLS_APP_GITHUB_CLIENT_ID || envConfig.githubClientId,
      isDevelopment: isDevelopment(env),
      isTesting: env === 'testing',
      isStaging: env === 'staging',
      isProduction: env === 'production'
      // Store all environment variables for potential future use
    }

    // Validate critical configuration values
    const requiredFields = [
      'socketUrl',
      'apiUrl',
      'githubClientId',
      'googleClientId'
    ]

    const missingFields = requiredFields.filter(field => !finalConfig[field])

    if (missingFields.length > 0) {
      console.error(
        `Missing required configuration: ${missingFields.join(', ')}`
      )
    }

    if (finalConfig.isDevelopment) {
      console.log(
        'environment in SDK:',
        env || process.env.NODE_ENV || process.env.NODE_ENV
      )
      console.log(finalConfig)
    }

    return finalConfig
  } catch (error) {
    console.error('Failed to load environment configuration:', error)

    // Return safe fallback values to prevent crashes
    return {
      ...CONFIG.development
    }
  }
}

export default getConfig()
