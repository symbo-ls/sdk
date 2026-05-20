// @symbo.ls/workspace-project-supabase — the Supabase-backed surface for
// the workspace-project worker. The SDK (`@symbo.ls/sdk`) re-exports
// everything here via its `./services/index.js` so the historic import
// shape (`import { WorkspaceProjectService, createSupabasePassthroughConfig }
// from '@symbo.ls/sdk'`) keeps working unchanged.
//
// Why a separate package: every namespace inside WorkspaceProjectService
// still routes to either the curated `/workspace-project/*` REST handlers
// (Supabase under the hood) or the PostgREST passthrough at
// `/workspace-project/sb/rest/v1/*`. Mongo-migrated surfaces moved out
// (tickets → TicketService, docs → DocService, etc.). Keeping the
// Supabase-coupled surface in its own package lets consumers that only
// need the Mongo APIs install just `@symbo.ls/sdk` without pulling in the
// PostgREST adapter machinery.

export {
  WorkspaceProjectService,
  workspaceProjectBaseUrl
} from './WorkspaceProjectService.js'

export {
  createSupabasePassthroughConfig,
  workspaceProjectEdgeFunctionUrl,
  workspaceExtensionSessionAccessToken
} from './supabasePassthrough.js'
