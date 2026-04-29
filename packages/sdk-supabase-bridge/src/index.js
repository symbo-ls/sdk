// @symbo.ls/sdk-supabase-bridge
//
// Supabase-flavoured federation bridge built on @symbo.ls/sdk-bridge.
// Multi-project auth, registry-driven Supabase client cache, edge-
// function login/logout/switch primitives. Consumer wires it once at
// boot — supply the project list, drive logins through the returned
// auth object.
//
//   import { createSupabaseBridge, readProject } from '@symbo.ls/sdk-supabase-bridge'
//
//   const bridge = createSupabaseBridge({
//     projects: [
//       { key: 'governance', opts: { required: true, fallback: { url, anonKey } } },
//       { key: 'financials', opts: { required: false, roleGate: ['admin'] } }
//     ],
//     defaultKey: 'governance',
//     appConfig: { required: ['governance'] }
//   })
//
//   await bridge.auth.loginAll({ email, password })
//   const client = bridge.registry.getClient('governance')
//
// Project-specific glue (PROJECT_GOVERNANCE/FINANCIALS constants,
// integrations catalog, MCP, prefs) lives in the consumer package.

import { createRegistry } from '@symbo.ls/sdk-bridge'
import { createSupabaseClient } from './clients.js'
import { buildRegistryConfig, createAppConfig, readProject } from './env.js'
import { createAuthBridge } from './bridge.js'
import { createCrossAppAuth } from './crossAppAuth.js'

export { createSupabaseClient } from './clients.js'
export { readProject, buildRegistryConfig, createAppConfig } from './env.js'
export { createAuthBridge } from './bridge.js'
export { createCrossAppAuth, DEFAULT_TOKEN_KEYS, SUPABASE_KEY_RE } from './crossAppAuth.js'

// Convenience factory — wires registry + auth bridge + crossAppAuth in one
// call. For finer control compose the primitives directly.
export function createSupabaseBridge ({
  projects = [],
  defaultKey,
  appConfig: appConfigOverride = null,
  crossAppAuth: crossAppAuthOpts = null,
  authBridge: authBridgeOpts = {}
} = {}) {
  const registryConfig = buildRegistryConfig(projects)
  const registry = createRegistry({
    projects: registryConfig,
    defaultKey,
    buildClient: createSupabaseClient
  })
  const appConfig = createAppConfig(() => registryConfig)
  if (appConfigOverride) appConfig.configure(appConfigOverride)

  const auth = createAuthBridge({ registry, appConfig, ...authBridgeOpts })
  const crossAppAuth = crossAppAuthOpts ? createCrossAppAuth(crossAppAuthOpts) : null

  return { registry, appConfig, auth, crossAppAuth, registryConfig }
}
