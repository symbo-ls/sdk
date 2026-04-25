// SDK federation — abstract multi-Supabase client + registry primitive.
//
// Extracted from governance/packages/sdk-bridge as part of the
// 2026-04-25 workspace refactor. This module knows nothing about
// governance or financials; it accepts a project registry at boot and
// exposes the same getClient/forEachClient surface that the legacy
// sdk-bridge had.
//
// Project-specific concerns (shouldActivate predicates for governance +
// financials, integrations subsystem, MCP connectors, claim refresh)
// stay in @symbo.ls/sdk-bridge — that package now imports the abstract
// core from here and layers its domain logic on top.

export { createFederation } from './federation.js'
export { createSupabaseClient } from './client.js'
