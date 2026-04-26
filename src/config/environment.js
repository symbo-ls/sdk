import { isDevelopment } from '@symbo.ls/utils'
import { apiUrl as channelApiUrl, socketUrl as channelSocketUrl } from '@symbo.ls/channels'
import { logger } from '../utils/logger.js'

// URL fields (apiUrl/socketUrl) come from `@symbo.ls/channels` — single source
// of truth across sdk, smbls, server, editor, workspace, platform. The
// per-env blocks below carry only the *non-channel* fields (githubClientId,
// kvUrl, dnsWorkerUrl, grafanaUrl, typesense*, features). Adding a new
// channel = edit server/packages/channels/channels.json. Adding a new SDK
// aux field = edit the per-env block below.

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
      betaFeatures: false,
      // Tracking is enabled by default unless overridden per environment
      trackingEnabled: true
    }
  },

  // Environment-specific configurations.
  // socketUrl/apiUrl are NOT set here — they come from @symbo.ls/channels.

  local: {
    kvUrl: 'https://smbls-kv-dev.nika-980.workers.dev',
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liAFrsR0StbAO6PO', // For github api
    grafanaUrl: '', // For grafana tracing
    grafanaAppName: 'Symbols Localhost',
    // Environment-specific feature toggles (override common)
    features: {
      // Disable tracking by default on localhost/dev machines
      trackingEnabled: false,
      // Enable beta features in local dev
      betaFeatures: true,
      // Preserve common defaults explicitly for local
      newUserOnboarding: true
    },
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'vZya3L2zpq8L6iI5WWMUZJZABvT63VDb',
    typesenseHost: 'localhost',
    typesensePort: '8108',
    typesenseProtocol: 'http'
  },
  development: {
    kvUrl: 'https://smbls-kv-dev.nika-980.workers.dev',
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liHxyWFBxS8f1gnF',
    grafanaUrl: '', // Disabled in dev — enable only in production
    grafanaAppName: 'Symbols Dev',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  },
  // Channel `test` (Cloud Run `smbls-api-test`, isolated `mongouri_testing`
  // Mongo, separate `smbls-api-test-*` buckets). Historically keyed `testing`
  // — kept as an alias below so existing SYMBOLS_APP_ENV=testing still
  // resolves. URL comes from @symbo.ls/channels.
  test: {
    githubClientId: 'Ov23liHxyWFBxS8f1gnF',
    grafanaUrl: '', // For grafana tracing
    grafanaAppName: 'Symbols Test',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  },
  upcoming: {
    githubClientId: 'Ov23liWF7NvdZ056RV5J',
    grafanaUrl: '', // For grafana tracing
    grafanaAppName: 'Symbols Upcoming',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  },
  staging: {
    kvUrl: 'https://smbls-kv-staging.nika-980.workers.dev',
    githubClientId: 'Ov23ligwZDQVD0VfuWNa',
    grafanaUrl: '', // For grafana tracing
    grafanaAppName: 'Symbols Staging',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  },
  preview: {
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liFAlOEIXtX3dBtR',
    grafanaUrl:
      'https://faro-collector-prod-us-east-0.grafana.net/collect/5c1089f3c3eea4ec5658e05c3f53baae', // For grafana tracing
    grafanaAppName: 'Symbols Preview',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  },
  production: {
    kvUrl: 'https://smbls-kv.nika-980.workers.dev',
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liFAlOEIXtX3dBtR',
    grafanaUrl:
      'https://faro-collector-prod-us-east-0.grafana.net/collect/5c1089f3c3eea4ec5658e05c3f53baae', // For grafana tracing
    grafanaAppName: 'Symbols',
    typesenseCollectionName: 'docs',
    typesenseApiKey: 'awmcVpbWqZi9IUgmvslp1C5LKDU8tMjA',
    typesenseHost: 'tl2qpnwxev4cjm36p-1.a1.typesense.net',
    typesensePort: '443',
    typesenseProtocol: 'https'
  }
}

// Back-compat alias: the historical `testing` env key now maps to the `test`
// channel. Existing SYMBOLS_APP_ENV=testing keeps working; new code should
// use `test`.
CONFIG.testing = CONFIG.test

// Determine environment with error handling
const getEnvironment = () => {
  // @preserve-env
  const env = process.env.SYMBOLS_APP_ENV || process.env.NODE_ENV || 'development'

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

    // Channel name maps from env. The historical `testing` env name resolves
    // to the canonical `test` channel.
    const channelName = env === 'testing' ? 'test' : env

    // Create the final config with environment variable overrides
    const finalConfig = {
      ...envConfig,
      // Deep-merge feature flags so env-specific overrides don't drop common defaults
      features: {
        ...(CONFIG.common.features || {}),
        ...((CONFIG[env] && CONFIG[env].features) || {})
      },
      // URLs come from @symbo.ls/channels (single source of truth across
      // sdk, smbls, server, editor, workspace, platform). SYMBOLS_API_URL /
      // SYMBOLS_SOCKET_URL env-var overrides honored inside the helpers.
      socketUrl: process.env.SYMBOLS_APP_SOCKET_URL || channelSocketUrl(channelName),
      apiUrl: process.env.SYMBOLS_APP_API_URL || channelApiUrl(channelName),
      githubClientId:
        process.env.SYMBOLS_APP_GITHUB_CLIENT_ID || envConfig.githubClientId,
      grafanaUrl: process.env.SYMBOLS_APP_GRAFANA_URL || envConfig.grafanaUrl,
      kvUrl: process.env.SYMBOLS_KV_URL || envConfig.kvUrl,
      dnsWorkerUrl: process.env.SYMBOLS_DNS_WORKER_URL || envConfig.dnsWorkerUrl,
      dnsApiKey: process.env.SYMBOLS_DNS_API_KEY || envConfig.dnsApiKey,
      typesenseCollectionName:
        process.env.TYPESENSE_COLLECTION_NAME ||
        envConfig.typesenseCollectionName,
      typesenseApiKey:
        process.env.TYPESENSE_API_KEY || envConfig.typesenseApiKey,
      typesenseHost: process.env.TYPESENSE_HOST || envConfig.typesenseHost,
      typesensePort: process.env.TYPESENSE_PORT || envConfig.typesensePort,
      typesenseProtocol:
        process.env.TYPESENSE_PROTOCOL || envConfig.typesenseProtocol,
      channel: channelName,
      isDevelopment: isDevelopment(env),
      isTest: env === 'test' || env === 'testing',
      isStaging: env === 'staging',
      isPreview: env === 'preview',
      isProduction: env === 'production'
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
      logger.error(
        `Missing required configuration: ${missingFields.join(', ')}`
      )
    }

    if (global.window) {
      global.window.finalConfig = finalConfig
    }

    return finalConfig
  } catch (error) {
    logger.error('Failed to load environment configuration:', error)

    // Return safe fallback values to prevent crashes
    return {
      ...CONFIG.development
    }
  }
}

export default getConfig()
