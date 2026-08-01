import { BaseService } from './BaseService.js'

// BootService — GET /core/boot. Single-round-trip composite of the
// workspace shell's boot-sequence reads (me / org / workspaces / workspace /
// members / prefs), collapsing the 3+ sequential API waves bootShell +
// loadPrivateData pay today (getMe -> getOrganization + listWorkspaces +
// getWorkspace -> users.members + workspaceProject.homeDashboardPrefs) into
// one call. See the server's src/domains/boot/controllers/BootController.js
// for the full section-by-section contract — every section mirrors its OWN
// individual endpoint's response shape verbatim, never reshaped (`data.me`
// is byte-equivalent to what sdk.getMe() itself returns, `data.workspace` to
// sdk.getWorkspace(id), `data.prefs` to the workspaceProject.
// homeDashboardPrefs `.prefs` row, etc.), and a failed/rejected section
// resolves to `data.<section> = null` + `errors.<section> = <message>`
// rather than failing the whole call. `data.workspaceProject` is always
// `null` — see `errors.workspaceProject` for why (no single reusable core
// service backs it; resolving + validating a workspace's module is a
// largely client-side pipeline — see workspaceProjects.js in the workspace
// repo).
export class BootService extends BaseService {
  /**
   * @param {{ workspaceId?: string }} [opts] — optional explicit workspace
   *   scope pin (multi-tab: the tab-chosen workspace wins over the caller's
   *   stored active workspace). Omit to use the caller's own active
   *   workspace — the exact server-side resolution (explicit param -> auth
   *   claim -> User.activeWorkspace) every other workspace-scoped /core
   *   route already uses, never a new rule invented for this endpoint.
   * @returns {Promise<{ data: object, errors: object }>}
   */
  async boot ({ workspaceId } = {}) {
    // _call() itself gates readiness (this._requireReady('boot')) — no need
    // to duplicate that check here, mirroring WorkspaceService.getWorkspace.
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
    return this._call('boot', `/boot${qs}`)
  }
}

export default BootService
