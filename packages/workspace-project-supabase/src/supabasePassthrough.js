// Edge-function URL composition for the workspace-project worker.
//
// This module previously also exported a Supabase REST/realtime passthrough
// adapter (`createSupabasePassthroughConfig` + `_createAdapterClient`) and the
// federated-session token reader (`workspaceExtensionSessionAccessToken`).
// Those were removed as dead code: the frontend routes every call through
// `sdk.execute(entity, op, args)`, and the `/workspace-project/sb` REST surface
// uses plain fetch (see the workspace `supabaseConfig.js` restHeaders) — never a
// supabase-js adapter client. Only edge-function URL composition remains, which
// `@symbo.ls/sdk` re-exports as `workspaceProjectEdgeFunctionUrl`.

import { workspaceProjectBaseUrl } from './WorkspaceProjectService.js'

export const workspaceProjectEdgeFunctionUrl = (apiBase, name) =>
  `${workspaceProjectBaseUrl(apiBase)}/sb/functions/v1/${name}`
