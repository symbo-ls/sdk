# SDK: merge `upcoming` → `main`

68 commits • 86 files • +9,112 / −984

## Summary

Brings `main` up to date with the work consolidated on `upcoming` since `v3.8.9`. The release reshapes the SDK around a credential-free, server-proxied architecture, adds new service wrappers for workspaces / credits / sharing / files, introduces two abstract bridge packages, and lands a substantial test suite covering the new surface.

## Highlights

### New services
- **`WorkspaceProjectService`** (+900) — full workspace-project CRUD + ownership transfer + execute() dispatcher.
- **`WorkspaceService`** (+241) — invitations, permissions, project listing under a workspace.
- **`CreditsService`** — project-level credit operations.
- **`SharedAssetService`** — shared-asset CRUD.
- **`AllocationRuleService`** — allocation-rule wrappers.
- **`supabasePassthrough`** — passthrough for Supabase-shaped reads.
- **`EntityDispatcher`** (+918) — central dispatcher for entity routing.

### Service expansions
- **`ProjectService`** +507: `/projects/{public,ownership,ownership/*}`, `/projects/:id/resources/*`, workspace transfer.
- **`OrganizationService`** +452: custom roles, effective-role, payments, team invitations, workspace access, admin listings, admin-override, Stripe bootstrap.
- **`AuthService`** +303: `/auth/me/{projects,teams,org-memberships}`, member-roles (INTRANET §90), org-notifications, freebusy, email verification, `getMeFamily`.
- **`FileService`** +79: file CRUD + R2 marketplace thumbnail upload (MP-4).
- **`SubscriptionService`** +123: pricing + feature flags.
- **`MetricsService`**: inline `/metrics/contributions`, new `getProjectUsage`.
- **`ScreenshotService`** +75: `{owner, key}` shape across all 8 methods, `refreshForEnvironment`, env-param docs.
- **`AdminService`**: `getProjectKeyStats`, rate-limit stats.
- **`KvService`**: removed.

### New bridge packages
- **`@symbo.ls/sdk-bridge`** — abstract registry, cookie + storage primitives.
- **`@symbo.ls/sdk-supabase-bridge`** — Supabase implementation: bridge, clients, cross-app auth, env config.
- `src/federation/` re-exports from both bridges; federation primitive added.

### Architecture
- **Credential-free SDK**: Typesense + Faro now routed through server proxies (no client credentials).
- **Project-key path**: 2-segment `(owner, key)` route support + `resolveAppkey` + `projectKeyPath` dedup helper.
- **`BaseService._call`**: collapses envelope boilerplate; 21 wrappers migrated; closes 7 variable-endpoint drift gaps.
- **Visibility-aware public data** + unlock + visibility probe on projects.
- **`switchWorkspace`** SDK method + WorkspaceProject route prefix.
- **Constants**: `roles` + `sourceAccess` extracted; signature drift fixed.

### CLI
- New `bin/sdk.js` — `symbols-sdk` CLI binary; Supabase added as peer-dep.

### Env / config
- Default env aligned to channels' `defaultChannel`.
- `next` environment added to `CONFIG`.
- `testing` env points at real test API host (`next.api`); CI watches `next` branch.

### Tests
- 18 new test files across `AdminService`, `AllocationRuleService`, `AuthService`, `CreditsService`, `FileService`, `MetricsService`, `OrganizationService` (×4), `ProjectService` (×3), `ScreenshotService`, `SharedAssetService`, `SubscriptionService`, `WorkspaceService`.
- 4 pre-existing `PlanService` failures cleared — 541/541 green.
- `*.test.js` excluded from production build glob.

### CI / docs
- 13 scheduled per-domain workflows consolidated into `scheduled-tests.yaml`; broken cron alerts silenced.
- README + `CoreService.md` + `symstory_client.md` + `sdk_usage.md` rewritten; `v4` references renamed to `v3.14`.
- `@symbo.ls/*` deps caret-pinned (`3.14.0` → `^3.14.0`).

## Risk / migration notes
- `KvService` retained with new API (direct `kvUrl` fetch; no longer routed through server proxy) — consumers previously relying on the old implementation should verify endpoint compatibility.
- `WorkspaceDataService` → `WorkspaceProjectService` rename.
- `ScreenshotService` methods now require `{owner, key}` instead of bare slug.
- Supabase moved to peer-dep — installs without it must add it.
- `getMe` family signature changes (drift fix); review call sites.

## CI on this PR
`pull-test-workflow.yaml` extended to fire on PRs targeting `main` (and `upcoming`) in addition to `next` — this PR will run the smoke suite against the `testing` env automatically.

## Test plan
- [ ] CI smoke-tests pass on this PR.
- [ ] `npm run test` — full suite green (target 541/541).
- [ ] Run integration tests against `next.api` env.
- [ ] Verify `bin/sdk.js` CLI entry executes (`npx symbols-sdk --help`).
- [ ] Smoke-test `WorkspaceProjectService.execute()` dispatcher against staging.
- [ ] Confirm Typesense + Faro requests resolve through server proxy (no client creds in network tab).
- [ ] Validate `sdk-bridge` + `sdk-supabase-bridge` resolve when consumed by `platform`.
