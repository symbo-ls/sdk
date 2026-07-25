import { BaseService } from './BaseService.js'
import { io as socketIoClient } from 'socket.io-client'
import { logger } from '../utils/logger.js'

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
//   PATCH  /imports/:repoId       → { envVars?, defaultBranch?, serviceRoot?,
//                                     buildpackBuilder? } → updated row
//                                   (400 no_updatable_fields on empty body)
//   DELETE /imports/:repoId       → { ok, repoId }
//   POST /imports/:repoId/trigger → queue a Build { branch?, commitSha? }
//   GET  /builds?limit=           → Build rows (queued|building|success|failed|canceled)
//   GET  /builds/:buildId         → one Build (poll for status)
//   GET  /builds/:buildId/logs?tailBytes=
//                                 → { logs, ref, truncated, available?,
//                                     external? } (external:true → ref is a
//                                     link-out URL and logs is empty)
//   POST /builds/:buildId/deploy  → run image on Cloud Run { region?,
//                                     allowUnauthenticated? } → { url, status }
//   GET  /deployments             → Deployment rows (pending|running|stopped|failed)
//   POST /deployments/:deploymentId/rollback
//                                 → NEW Deployment row (append-only history;
//                                     409 build_not_deployable)
//   POST /deployments/:deploymentId/scale
//                                 → { minInstances?, maxInstances?, cpu?,
//                                     memory? } → updated Deployment
//                                     (409 deployment_not_scalable)
//
// Socket: 'build-status-changed' + 'deployment-status-changed' on the
// user-socket channel after status transitions — subscribeWorkspaceBuilds
// wraps the same socket.io transport as subscribeUserEvents /
// subscribeWorkspaceCanvasLayout and fans both through.

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
   * Update an imported repo's build settings. Server-side allowlist —
   * only { envVars, defaultBranch, serviceRoot, buildpackBuilder } are
   * updatable; the server rejects an empty/no-op payload with
   * 400 `no_updatable_fields` (the client passes the body through as-is).
   * @param {string} workspaceId
   * @param {string} repoId — WorkspaceRepo id
   * @param {{ envVars?: object, defaultBranch?: string, serviceRoot?: string, buildpackBuilder?: string }} [payload]
   * @returns {Promise<object>} the updated WorkspaceRepo row
   */
  updateBuildImport (workspaceId, repoId, payload = {}) {
    if (!repoId) throw new Error('repoId is required')
    return this._call(
      'updateBuildImport',
      `${wsBase(workspaceId)}/imports/${encodeURIComponent(repoId)}`,
      { method: 'PATCH', body: payload }
    )
  }

  /**
   * Remove an imported repo (WorkspaceRepo) from the workspace. Only the
   * import row is deleted — the GitHub repository itself is untouched.
   * @param {string} workspaceId
   * @param {string} repoId — WorkspaceRepo id
   * @returns {Promise<{ ok: boolean, repoId: string }>}
   */
  deleteBuildImport (workspaceId, repoId) {
    if (!repoId) throw new Error('repoId is required')
    return this._call(
      'deleteBuildImport',
      `${wsBase(workspaceId)}/imports/${encodeURIComponent(repoId)}`,
      { method: 'DELETE' }
    )
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
   * Tail of a build's Cloud Build log. `external: true` means the log lives
   * behind `ref` (a link-out URL) and `logs` is empty — render a link
   * instead of a log pane.
   * @param {string} workspaceId
   * @param {string} buildId
   * @param {{ tailBytes?: number }} [options] — cap on how much log tail to return
   * @returns {Promise<{ logs: string, ref: string|null, truncated: boolean, available?: boolean, external?: boolean }>}
   */
  getBuildLogs (workspaceId, buildId, { tailBytes } = {}) {
    if (!buildId) throw new Error('buildId is required')
    const query = tailBytes ? `?tailBytes=${encodeURIComponent(tailBytes)}` : ''
    return this._call(
      'getBuildLogs',
      `${wsBase(workspaceId)}/builds/${encodeURIComponent(buildId)}/logs${query}`
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

  /**
   * Roll a service back by redeploying the given deployment's build.
   * Deployment history is append-only — resolves with the NEW Deployment
   * row (the rollback), never a mutation of the old one. Rejects with
   * 409 `build_not_deployable` when the source build's image can no longer
   * be redeployed.
   * @param {string} workspaceId
   * @param {string} deploymentId — Deployment to roll back to
   * @returns {Promise<object>} the new Deployment row
   */
  rollbackDeployment (workspaceId, deploymentId) {
    if (!deploymentId) throw new Error('deploymentId is required')
    return this._call(
      'rollbackDeployment',
      `${wsBase(workspaceId)}/deployments/${encodeURIComponent(deploymentId)}/rollback`,
      { method: 'POST' }
    )
  }

  /**
   * Scale a running Cloud Run deployment in place. Instance counts are
   * integers 0..20 with min <= max; `cpu` is '1'|'2'|'4'; `memory` is a
   * Cloud Run size like '512Mi'|'1Gi'. Rejects with 409
   * `deployment_not_scalable` when the target isn't a running cloudrun
   * deployment.
   * @param {string} workspaceId
   * @param {string} deploymentId
   * @param {{ minInstances?: number, maxInstances?: number, cpu?: string, memory?: string }} [payload]
   * @returns {Promise<object>} the updated Deployment row
   */
  scaleDeployment (workspaceId, deploymentId, payload = {}) {
    if (!deploymentId) throw new Error('deploymentId is required')
    return this._call(
      'scaleDeployment',
      `${wsBase(workspaceId)}/deployments/${encodeURIComponent(deploymentId)}/scale`,
      { method: 'POST', body: payload }
    )
  }

  /**
   * Cloud Run metrics buckets for a deployment — written by the server's
   * MetricsCollectorService (60s GCP Monitoring poller, GATED OFF by default
   * behind METRICS_COLLECTOR_ENABLED; the /infra Metrics tab stays
   * mock-labeled until an operator opts the collector in). Rows are
   * ascending by `ts` (oldest → newest, chart-ready); 404s when
   * `deploymentId` isn't in this workspace.
   * @param {string} workspaceId
   * @param {string} deploymentId
   * @param {{ interval?: '1m'|'1h', since?: string, until?: string, limit?: number }} [options]
   * @returns {Promise<Array<{ ts: string, interval: string, requestCount: number|null, errorCount: number|null, p50LatencyMs: number|null, p95LatencyMs: number|null, cpuUtilization: number|null, memoryUtilization: number|null, instanceCount: number|null, billableInstanceTime: number|null }>>}
   */
  getDeploymentMetrics (workspaceId, deploymentId, { interval, since, until, limit } = {}) {
    if (!deploymentId) throw new Error('deploymentId is required')
    const params = new URLSearchParams()
    if (interval) params.set('interval', interval)
    if (since) params.set('since', since)
    if (until) params.set('until', until)
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return this._call(
      'getDeploymentMetrics',
      `${wsBase(workspaceId)}/deployments/${encodeURIComponent(deploymentId)}/metrics${query}`
    )
  }

  /**
   * Subscribe to the build/deploy control-plane events broadcast on the
   * user socket after every status transition:
   *   `build-status-changed`      — { workspaceId, buildId, status, imageRef,
   *                                   error, repositoryFullName, branch }
   *   `deployment-status-changed` — { workspaceId, deploymentId, status, url,
   *                                   error, buildId }
   *
   * Mirrors subscribeWorkspaceCanvasLayout / subscribeUserEvents: opens a
   * socket.io connection to the server's `/user-socket` namespace and fans
   * each event through to the matching handler with the RAW payload.
   * Auto-reconnects with exponential back-off.
   *
   * Pass `workspaceId` to drop events for other workspaces client-side;
   * without it every workspace the user belongs to fans through.
   *
   * Returns an unsubscribe function that closes the socket and stops
   * delivery.
   *
   * Fail-soft: if no handler, token, or baseUrl is available the function
   * still returns a no-op unsubscribe so call sites don't need guards.
   *
   * @param {{ onBuildStatus?: (payload: object) => void, onDeploymentStatus?: (payload: object) => void, workspaceId?: string }} [handlers]
   * @returns {() => void} unsubscribe
   */
  subscribeWorkspaceBuilds (handlers = {}) {
    const { onBuildStatus, onDeploymentStatus, workspaceId } = handlers || {}
    const hasBuildHandler = typeof onBuildStatus === 'function'
    const hasDeploymentHandler = typeof onDeploymentStatus === 'function'
    if (!hasBuildHandler && !hasDeploymentHandler) return () => {}
    if (!this._tokenManager) return () => {}
    const token = this._tokenManager.getAccessToken?.()
    if (!token) return () => {}
    const baseUrl = this._apiUrl
    if (!baseUrl) return () => {}

    let socket
    try {
      // `_ioFactory` is a test seam — always undefined in production, so the
      // real socket.io-client transport is used with the exact options of
      // subscribeWorkspaceCanvasLayout / subscribeUserEvents.
      const io = this._ioFactory || socketIoClient
      socket = io(baseUrl, {
        path: '/user-socket',
        transports: ['websocket', 'polling'],
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000
      })
    } catch (err) {
      logger.warn('[sdk.subscribeWorkspaceBuilds] socket init failed:', err?.message || err)
      return () => {}
    }

    let _loggedAuthFail = false
    socket.on('connect_error', (err) => {
      if (err?.message && !_loggedAuthFail) {
        _loggedAuthFail = true
        logger.warn('[sdk.subscribeWorkspaceBuilds] connect_error:', err.message)
      }
    })

    // Optional client-side workspace scoping — same semantics as the
    // canvas-layout filter: only drop when BOTH sides carry a workspaceId
    // and they differ.
    const isForeign = (payload) =>
      Boolean(workspaceId && payload?.workspaceId && payload.workspaceId !== workspaceId)

    if (hasBuildHandler) {
      socket.on('build-status-changed', (payload) => {
        if (isForeign(payload)) return
        try {
          onBuildStatus(payload)
        } catch (err) {
          logger.warn('[sdk.subscribeWorkspaceBuilds] onBuildStatus threw:', err?.message || err)
        }
      })
    }

    if (hasDeploymentHandler) {
      socket.on('deployment-status-changed', (payload) => {
        if (isForeign(payload)) return
        try {
          onDeploymentStatus(payload)
        } catch (err) {
          logger.warn('[sdk.subscribeWorkspaceBuilds] onDeploymentStatus threw:', err?.message || err)
        }
      })
    }

    return () => {
      try { socket.removeAllListeners() } catch (_) {}
      try { socket.disconnect() } catch (_) {}
    }
  }
}
