// Back-compat layer. The federation primitives now live in dedicated
// packages so consumers that only need the bridge don't have to install
// the full SDK:
//
//   @symbo.ls/sdk-bridge          — abstract registry + cookie/storage
//   @symbo.ls/sdk-supabase-bridge — Supabase impl (createSupabaseClient,
//                                   createAuthBridge, createCrossAppAuth)
//
// `createFederation` is preserved as a thin convenience that pre-wires
// `createRegistry` with `createSupabaseClient` so existing
// `@symbo.ls/sdk/federation` callers don't have to change.

import { createRegistry } from '@symbo.ls/sdk-bridge'
import { createSupabaseClient } from '@symbo.ls/sdk-supabase-bridge'

export const createFederation = ({ projects = {}, defaultKey } = {}) =>
  createRegistry({ projects, defaultKey, buildClient: createSupabaseClient })

export { createSupabaseClient }
