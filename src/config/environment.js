import { isDevelopment } from '@symbo.ls/utils'
import { apiUrl as channelApiUrl, socketUrl as channelSocketUrl } from '@symbo.ls/channels'
import { logger } from '../utils/logger.js'

// URL fields (apiUrl/socketUrl) come from `@symbo.ls/channels` — single source
// of truth across sdk, smbls, server, editor, workspace, platform. The
// per-env blocks below carry only public, non-credential fields
// (githubClientId, dnsWorkerUrl, grafanaAppName, typesenseCollectionName,
// features).
//
// CREDENTIAL POLICY: this file ships in the published @symbo.ls/sdk package,
// so it must contain ZERO secrets. Routes that need credentials go through
// server middleware (server holds keys in .env):
//   - Grafana Faro telemetry → POST ${apiUrl}/telemetry/faro
//   - Typesense docs search  → GET  ${apiUrl}/search/docs
// .env overrides are honored for self-hosted / dev scenarios but NEVER
// hardcoded as fallbacks here.

// Base configuration with defaults and environment-specific overrides
const CONFIG = {
  // Common defaults for all environments
  common: {
    // Google OAuth Web client. Hosted in symbols-main (project number
    // 93720420804). Public identifier — no secret embedded; the matching
    // Client Secret lives in Infisical (GOOGLE_OAUTH_CLIENT_SECRET) and
    // is only used server-side by AuthOAuthController during the
    // code-for-token exchange. Authorized origins + redirect URIs are
    // configured in Console (Credentials → this client) per env.
    googleClientId:
      '93720420804-eaafvil4gpj2mnpqpo1he5el0ph6ekhc.apps.googleusercontent.com',
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
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liAFrsR0StbAO6PO',
    grafanaAppName: 'Symbols Localhost',
    features: {
      trackingEnabled: false,
      betaFeatures: true,
      newUserOnboarding: true
    },
    typesenseCollectionName: 'docs'
  },
  development: {
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liHxyWFBxS8f1gnF',
    grafanaAppName: 'Symbols Dev',
    typesenseCollectionName: 'docs'
  },
  test: {
    githubClientId: 'Ov23liHxyWFBxS8f1gnF',
    grafanaAppName: 'Symbols Test',
    typesenseCollectionName: 'docs'
  },
  next: {
    githubClientId: 'Ov23liHxyWFBxS8f1gnF',
    grafanaAppName: 'Symbols Next',
    typesenseCollectionName: 'docs'
  },
  upcoming: {
    githubClientId: 'Ov23liWF7NvdZ056RV5J',
    grafanaAppName: 'Symbols Upcoming',
    typesenseCollectionName: 'docs'
  },
  staging: {
    githubClientId: 'Ov23ligwZDQVD0VfuWNa',
    grafanaAppName: 'Symbols Staging',
    typesenseCollectionName: 'docs'
  },
  preview: {
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liFAlOEIXtX3dBtR',
    grafanaAppName: 'Symbols Preview',
    typesenseCollectionName: 'docs'
  },
  production: {
    dnsWorkerUrl: 'https://dns.symbo.ls',
    githubClientId: 'Ov23liFAlOEIXtX3dBtR',
    grafanaAppName: 'Symbols',
    typesenseCollectionName: 'docs'
  }
}

// Back-compat alias: the historical `testing` env key now maps to the `test`
// channel. Existing NODE_ENV=testing keeps working; new code should
// use `test`.
CONFIG.testing = CONFIG.test

// Parse apiUrl into typesense-docsearch.js node-config fields. The proxy
// lives at `${apiUrl}/search/docs/multi_search`; setting
// `nodes: [{ host, port, protocol, path: '/search/docs' }]` makes the
// Typesense client POST there. Direct-access env-var overrides
// (TYPESENSE_*) win when set, for self-hosted scenarios.
const parseSearchEndpoint = (apiUrl) => {
  let host = ''
  let port = ''
  let protocol = ''
  try {
    const u = new URL(apiUrl)
    host = u.hostname
    protocol = u.protocol.replace(':', '')
    port = u.port || (protocol === 'https' ? '443' : '80')
  } catch (_e) {
    // apiUrl unparseable — leave fields empty; consumer must override
  }
  return {
    typesenseSearchUrl: `${apiUrl}/search/docs/multi_search`,
    typesenseSearchPath: '/search/docs',
    typesenseHost: process.env.TYPESENSE_HOST || host,
    typesensePort: process.env.TYPESENSE_PORT || port,
    typesenseProtocol: process.env.TYPESENSE_PROTOCOL || protocol,
    // Placeholder string sent to the proxy; the server replaces it with
    // the real key from its .env. Consumers using direct Typesense access
    // override via TYPESENSE_API_KEY env.
    typesenseApiKey: process.env.TYPESENSE_API_KEY || 'proxy',
  }
}

// Determine environment with error handling. Default matches
// @symbo.ls/channels' `defaultChannel` so SDK config + channel
// resolution land on the same env when nothing is explicitly set.
const getEnvironment = () => {
  // @preserve-env
  const env = process.env.NODE_ENV || 'next'

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

    // Pass no explicit name to channelApiUrl so currentChannel() runs at the
    // call site and a runtime `globalThis.__SYMBOLS_CHANNEL__` override wins
    // — used by dev shells to point the SDK at http://localhost:8080 without
    // rebuilding the bundle. Fall back to env-derived channelName when the
    // override isn't set so production stays deterministic.
    const apiUrl =
      process.env.SYMBOLS_APP_API_URL ||
      (typeof globalThis !== 'undefined' && globalThis.__SYMBOLS_CHANNEL__
        ? channelApiUrl()
        : channelApiUrl(channelName))

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
      socketUrl:
        process.env.SYMBOLS_APP_SOCKET_URL ||
        (typeof globalThis !== 'undefined' && globalThis.__SYMBOLS_CHANNEL__
          ? channelSocketUrl()
          : channelSocketUrl(channelName)),
      apiUrl,
      githubClientId:
        process.env.SYMBOLS_APP_GITHUB_CLIENT_ID || envConfig.githubClientId,
      // Telemetry: TrackingService routes through @symbo.ls/analyzing →
      // the main server's /core/analyzed/* surface (Mongo-backed).
      // `grafanaUrl` is kept as a legacy escape hatch — when set,
      // TrackingService can be configured with `tracking.transport` to ship
      // to a Grafana Faro receiver instead. Default is empty so the SDK-
      // routed transport wins.
      grafanaUrl: process.env.SYMBOLS_APP_GRAFANA_URL || null,
      dnsWorkerUrl: process.env.SYMBOLS_DNS_WORKER_URL || envConfig.dnsWorkerUrl,
      dnsApiKey: process.env.SYMBOLS_DNS_API_KEY || '',
      // Typesense docs search: SDK calls the server proxy at
      // ${apiUrl}/search/docs/multi_search. Server holds TYPESENSE_API_KEY +
      // TYPESENSE_HOST in its .env. Direct Typesense access still possible
      // via env vars for self-hosted/dev (e.g. local docker). Pre-parsed
      // host/port/protocol/path fields are exported so consumers can plug
      // them straight into typesense-docsearch.js's `nodes[0]` config.
      ...parseSearchEndpoint(apiUrl),
      typesenseCollectionName:
        process.env.TYPESENSE_COLLECTION_NAME ||
        envConfig.typesenseCollectionName,
      channel: channelName,
      isDevelopment: isDevelopment(env),
      isTest: env === 'test' || env === 'testing',
      // Back-compat — historical consumers branch on `isTesting`. Mirror
      // `isTest` so the rename doesn't silently produce `undefined`. Drop
      // once all consumers land on `isTest`.
      isTesting: env === 'test' || env === 'testing',
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
