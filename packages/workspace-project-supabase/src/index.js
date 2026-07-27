// The SDK surface for the workspace-project worker.
//
// ⚠️ THE PACKAGE NAME IS NOW A MISNOMER. Nothing in here is Supabase-backed
// any more: the `/sb` PostgREST passthrough (`_sb` / `_sbCrud`) and the
// edge-function URL helper are deleted, and every namespace addresses either a
// `/core/*` route on the main server or one of the worker's own CURATED
// `/workspace-project/*` handlers. Renaming the package is a mechanical
// follow-up gated only on the dependent package.json files.
//
// The original reason for a separate package — "let consumers that only need
// the Mongo APIs skip the PostgREST adapter machinery" — no longer applies,
// because that machinery is gone. It stays a package purely so the historic
// import shape (`import { WorkspaceProjectService } from '@symbo.ls/sdk'`)
// keeps working; `@symbo.ls/sdk` re-exports it via `./services/index.js`.

export { WorkspaceProjectService, workspaceProjectBaseUrl } from './WorkspaceProjectService.js'
