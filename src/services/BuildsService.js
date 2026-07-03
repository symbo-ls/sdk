import { BaseService } from './BaseService.js'

// BuildsService wraps the workspace-scoped Builds & Deploy pipeline on the
// main server (/core/builds/* — GitHub App install → repo import → Cloud
// Build/buildpacks → Artifact Registry → Cloud Run). Peer service to
// CanvasLayoutService / TicketService. Backs the /infra deployment canvas.
//
// Routes (all under /builds/workspaces/:workspaceId, session/JWT auth;
// reads need workspace membership, mutations owner/admin/editor):
//   GET  /github                  → { connected, installationId, installUrl }
//   GET  /repos                   → repos the GitHub App install can access
//                                   (409 github_not_connected without install)
//   GET  /imports                 → WorkspaceRepo rows (imported repos)
//   POST /imports                 → { repositoryFullName, defaultBranch?,
//                                     serviceRoot?, buildpackBuilder?,
//                                     envVars?, project? }
//   POST /imports/:repoId/trigger → queue a Build { branch?, commitSha? }
//   GET  /builds?limit=           → Build rows (queued|building|success|failed|canceled)
//   GET  /builds/:buildId         → one Build (poll for status)
//   POST /builds/:buildId/deploy  → run image on Cloud Run { region?,
//                                     allowUnauthenticated? } → { url, status }
//   GET  /deployments             → Deployment rows (pending|running|stopped|failed)

const wsBase = (workspaceId) => {
  if (!workspaceId) throw new Error('workspaceId is required')
  return `/builds/workspaces/${encodeURIComponent(workspaceId)}`
}

export class BuildsService extends BaseService {
  /**
   * GitHub App connect state for a workspace — drives the /infra
   * "Connect GitHub" vs repo-picker UI.
   * @param {string} workspaceId
   * @returns {Promise<{ connected: boolean, installationId: string|null, installUrl: string|null }>}
   */
  getBuildsGitHubState (workspaceId) {
    return this._call('getBuildsGitHubState', `${wsBase(workspaceId)}/github`)
  }

  /**
   * Repos the workspace's GitHub App installation can access.
   * Rejects with 409 `github_not_connected` when no installation exists.
   * @param {string} workspaceId
   * @returns {Promise<Array<{ id, fullName, name, defaultBranch, private, repoUrl }>>}
   */
  listBuildRepos (workspaceId) {
    return this._call('listBuildRepos', `${wsBase(workspaceId)}/repos`)
  }

  /**
   * Imported repos (WorkspaceRepo rows) — the persisted web-service nodes.
   * @param {string} workspaceId
   */
  listBuildImports (workspaceId) {
    return this._call('listBuildImports', `${wsBase(workspaceId)}/imports`)
  }

  /**
   * Import a repo into the workspace (creates the service).
   * @param {string} workspaceId
   * @param {{ repositoryFullName: string, defaultBranch?: string, serviceRoot?: string, buildpackBuilder?: string, envVars?: object, project?: string }} payload
   */
  createBuildImport (workspaceId, payload = {}) {
    if (!payload.repositoryFullName) {
      throw new Error('repositoryFullName is required')
    }
    return this._call('createBuildImport', `${wsBase(workspaceId)}/imports`, {
      method: 'POST',
      body: payload
    })
  }

  /**
   * Trigger a build for an imported repo (queued → building → success/failed).
   * @param {string} workspaceId
   * @param {string} repoId — WorkspaceRepo id
   * @param {{ branch?: string, commitSha?: string }} [payload]
   */
  triggerBuild (workspaceId, repoId, payload = {}) {
    if (!repoId) throw new Error('repoId is required')
    return this._call(
      'triggerBuild',
      `${wsBase(workspaceId)}/imports/${encodeURIComponent(repoId)}/trigger`,
      { method: 'POST', body: payload }
    )
  }

  /**
   * List builds, newest first.
   * @param {string} workspaceId
   * @param {{ limit?: number }} [options]
   */
  listBuilds (workspaceId, { limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : ''
    return this._call('listBuilds', `${wsBase(workspaceId)}/builds${query}`)
  }

  /**
   * One build by id — poll this for status transitions.
   * @param {string} workspaceId
   * @param {string} buildId
   */
  getBuild (workspaceId, buildId) {
    if (!buildId) throw new Error('buildId is required')
    return this._call(
      'getBuild',
      `${wsBase(workspaceId)}/builds/${encodeURIComponent(buildId)}`
    )
  }

  /**
   * Deploy a successful build's image to Cloud Run; resolves with the
   * Deployment (status `running` + live `url` on success).
   * @param {string} workspaceId
   * @param {string} buildId
   * @param {{ region?: string, allowUnauthenticated?: boolean }} [payload]
   */
  deployBuild (workspaceId, buildId, payload = {}) {
    if (!buildId) throw new Error('buildId is required')
    return this._call(
      'deployBuild',
      `${wsBase(workspaceId)}/builds/${encodeURIComponent(buildId)}/deploy`,
      { method: 'POST', body: payload }
    )
  }

  /**
   * Deployment history for the workspace, newest first.
   * @param {string} workspaceId
   */
  listBuildDeployments (workspaceId) {
    return this._call('listBuildDeployments', `${wsBase(workspaceId)}/deployments`)
  }
}
