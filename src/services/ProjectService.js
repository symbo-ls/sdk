import { BaseService } from './BaseService.js'
import { computeOrdersForTuples } from '../utils/ordering.js'
import { preprocessChanges } from '../utils/changePreprocessor.js'
import { deepStringifyFunctions } from '@symbo.ls/utils'
import { PROJECT_SOURCE_ACCESS } from '../constants/roles.js'
import { projectKeyPath as keyPath } from '../utils/projectKeyPath.js'

export class ProjectService extends BaseService {
  // ==================== PROJECT METHODS ====================

  /**
   * Create a user-owned project (owner = authenticated user).
   *
   * For org-owned projects use `organizationService.createOrgProject(orgId, data)`
   * which hits `POST /organizations/:orgId/projects` and scopes ownership
   * to the org.
   *
   * `projectData.key` / `projectData.slug` is optional — server mints a
   * bare slug via allocateUniqueProjectKey when omitted. Accepted shapes:
   *   - bare slug (canonical): `{ name, projectType, slug: 'my-app' }`
   *   - legacy compound: `{ name, slug: 'owner--my-app' }` — server strips
   *     the owner segment via parseOwnerProjectKey
   *   - legacy suffix: `{ name, slug: 'my-app.symbo.ls' }` — stripped
   *
   * Post-§45 identity is `(ownerOrganization|ownerUser FK, key)`; two
   * different owners can legitimately reuse the same bare slug.
   *
   * @param {object} projectData - { name, projectType, slug?, workspaceId?, ...content }
   */
  async createProject (projectData) {
    this._requireReady('createProject')
    try {
      const response = await this._request('/projects', {
        method: 'POST',
        body: JSON.stringify(projectData),
        methodName: 'createProject'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`, { cause: error })
    }
  }

  async getProjects (params = {}) {
    this._requireReady('getProjects')
    try {
      const queryParams = new URLSearchParams()

      // Add query parameters
      Object.keys(params).forEach(key => {
        if (params[key] != null) {
          queryParams.append(key, params[key])
        }
      })

      const queryString = queryParams.toString()

      // Inline both branches as literals so the drift analyzer can match
      // them against GET /projects (it can't see through `_request(url, …)`).
      const response = queryString
        ? await this._request(`/projects?${queryString}`, {
          method: 'GET',
          methodName: 'getProjects'
        })
        : await this._request('/projects', {
          method: 'GET',
          methodName: 'getProjects'
        })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get projects: ${error.message}`, { cause: error })
    }
  }

  /**
   * Alias for getProjects for consistency with API naming
   */
  async listProjects (params = {}) {
    return await this.getProjects(params)
  }

  /**
   * List only public projects (no authentication required)
   */
  async listPublicProjects (params = {}) {
    try {
      const queryParams = new URLSearchParams()

      // Add query parameters
      Object.keys(params).forEach(key => {
        if (params[key] != null) {
          queryParams.append(key, params[key])
        }
      })

      const queryString = queryParams.toString()

      // Literals inlined at both branches so the drift analyzer can
      // match /projects/public (it can't see through `_request(url, …)`).
      const response = queryString
        ? await this._request(`/projects/public?${queryString}`, {
          method: 'GET',
          methodName: 'listPublicProjects'
        })
        : await this._request('/projects/public', {
          method: 'GET',
          methodName: 'listPublicProjects'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list public projects: ${error.message}`, { cause: error })
    }
  }

  async getProject (projectId) {
    this._requireReady('getProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'GET',
        methodName: 'getProject'
      })
      if (response.success) {
        const iconSrc = response.data.icon
          ? `${this._apiUrl}/core/files/public/${response.data.icon.id}/download`
          : null
        return {
          ...response.data,
          icon: { src: iconSrc, ...response.data.icon }
        }
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get a public project by ID (no authentication required)
   * Corresponds to router.get('/public/:projectId', ProjectController.getPublicProject)
   */
  async getPublicProject (projectId) {
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/public/${projectId}`, {
        method: 'GET',
        methodName: 'getPublicProject'
      })
      if (response.success) {
        const iconSrc = response.data.icon
          ? `${this._apiUrl}/core/files/public/${response.data.icon.id}/download`
          : null
        return {
          ...response.data,
          icon: { src: iconSrc, ...response.data.icon }
        }
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get public project: ${error.message}`, { cause: error })
    }
  }

  /**
   * Look up a project by its key. Pass `{owner, key}` to use the
   * collision-safe 2-seg route when the owner is known.
   *
   * @param {string | { owner?: string, key: string }} keyOrSpec
   */
  async getProjectByKey (keyOrSpec) {
    this._requireReady('getProjectByKey')
    const path = keyPath(keyOrSpec)
    try {
      const response = await this._request(`/projects/key/${path}`, {
        method: 'GET',
        methodName: 'getProjectByKey'
      })
      if (response.success) {
        const iconSrc = response.data.icon
          ? `${this._apiUrl}/core/files/public/${response.data.icon.id}/download`
          : null

        return {
          ...response.data,
          icon: { src: iconSrc, ...response.data.icon }
        }
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project by key: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get current project data by key (no project ID required). Pass
   * `{owner, key}` to use the collision-safe 2-seg route when owner is
   * known.
   *
   * @param {string | { owner?: string, key: string }} keyOrSpec
   * @param {object} [options]
   */
  async getProjectDataByKey (keyOrSpec, options = {}) {
    this._requireReady('getProjectDataByKey')
    const path = keyPath(keyOrSpec)

    const {
      branch = 'main',
      version = 'latest',
      includeHistory = false,
      headers
    } = options

    const queryParams = new URLSearchParams({
      branch,
      version,
      includeHistory: includeHistory.toString()
    }).toString()

    try {
      const response = await this._request(
        `/projects/key/${path}/data?${queryParams}`,
        {
          method: 'GET',
          methodName: 'getProjectDataByKey',
          ...(headers ? { headers } : {})
        }
      )

      if (response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project data by key: ${error.message}`, { cause: error })
    }
  }

  /**
   * Anonymous read of a public project's current data for a given env.
   * Server-side gated on `project.visibility === 'public'`. Returns null on
   * 403/404 so callers can fall back to the authed route. Pass `{owner, key}`
   * to use the collision-safe 2-seg route.
   *
   * @param {string | { owner?: string, key: string }} keyOrSpec
   * @param {{ envKey: string }} opts
   */
  async getPublicProjectDataByKey (keyOrSpec, { envKey } = {}) {
    if (!envKey) throw new Error('Environment key is required')
    const path = keyPath(keyOrSpec)
    try {
      const response = await this._request(
        `/projects/key/${path}/public/${encodeURIComponent(envKey)}/data`,
        { method: 'GET', methodName: 'getPublicProjectDataByKey' }
      )
      if (response?.success) return response.data
      return null
    } catch (error) {
      const status = error?.cause?.status || error?.status
      if (status === 403 || status === 404) return null
      throw new Error(
        `Failed to get public project data by key: ${error.message}`,
        { cause: error }
      )
    }
  }

  /**
   * Resolve a domain / hostname / appkey to `{owner, key}`. Used by mermaid
   * edge + any client that needs the canonical `(owner, key)` pair from a
   * raw hostname (e.g. `silverbreeze.silverbreeze-labs.symbo.ls`).
   *
   * @param {string} appkey - hostname, custom domain, or bare key
   * @returns {Promise<{ owner: string | null, key: string }>}
   */
  async resolveAppkey (appkey) {
    if (!appkey) throw new Error('appkey is required')
    const response = await this._request(
      `/projects/resolve/${encodeURIComponent(appkey)}`,
      { method: 'GET', methodName: 'resolveAppkey' }
    )
    if (response?.owner !== undefined || response?.key !== undefined) {
      return response
    }
    if (response?.success && response.data) return response.data
    throw new Error(response?.message || 'Failed to resolve appkey')
  }

  async updateProject (projectId, data) {
    this._requireReady('updateProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        methodName: 'updateProject'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project: ${error.message}`, { cause: error })
    }
  }

  async updateProjectComponents (projectId, components) {
    this._requireReady('updateProjectComponents')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(
        `/projects/${projectId}/components`,
        {
          method: 'PATCH',
          body: JSON.stringify({ components }),
          methodName: 'updateProjectComponents'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project components: ${error.message}`, { cause: error })
    }
  }

  async updateProjectSettings (projectId, settings) {
    this._requireReady('updateProjectSettings')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ settings }),
        methodName: 'updateProjectSettings'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project settings: ${error.message}`, { cause: error })
    }
  }

  async updateProjectName (projectId, name) {
    this._requireReady('updateProjectName')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
        methodName: 'updateProjectName'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project name: ${error.message}`, { cause: error })
    }
  }

  // Single axis controlling both source read scope AND library consumption scope.
  // Replaces setProjectAccess / setProjectVisibility.
  async setProjectSourceAccess (projectId, sourceAccess) {
    if (!projectId) throw new Error('Project ID is required')
    if (!sourceAccess) throw new Error('sourceAccess is required')
    if (!PROJECT_SOURCE_ACCESS.includes(sourceAccess)) {
      throw new Error(
        `Invalid sourceAccess: ${sourceAccess}. Must be one of: ${PROJECT_SOURCE_ACCESS.join(', ')}`
      )
    }
    return this._call('setProjectSourceAccess', `/projects/${projectId}`, {
      method: 'PATCH',
      body: { sourceAccess },
    })
  }

  /** @deprecated Use setProjectSourceAccess. Removed when server drops Project.access (Phase 3). */
  async setProjectAccess (projectId, access) {
    this._requireReady('setProjectAccess')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!access) {
      throw new Error('Access level is required')
    }

    const allowedAccessValues = ['account', 'team', 'organization', 'public']
    if (!allowedAccessValues.includes(access)) {
      throw new Error(
        `Invalid access value: ${access}. Must be one of: ${allowedAccessValues.join(', ')}`
      )
    }

    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ access }),
        methodName: 'setProjectAccess'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to set project access: ${error.message}`, { cause: error })
    }
  }

  /** @deprecated visibility moved to per-env (MODEL.md §Project). Kept for compatibility until Phase 3 removes it server-side. */
  async setProjectVisibility (projectId, visibility) {
    this._requireReady('setProjectVisibility')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!visibility) {
      throw new Error('Visibility is required')
    }

    const allowedVisibilityValues = ['public', 'private', 'password-protected']
    if (!allowedVisibilityValues.includes(visibility)) {
      throw new Error(
        `Invalid visibility value: ${visibility}. Must be one of: ${allowedVisibilityValues.join(', ')}`
      )
    }

    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility }),
        methodName: 'setProjectVisibility'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to set project visibility: ${error.message}`, { cause: error })
    }
  }

  async updateProjectPackage (projectId, pkg) {
    this._requireReady('updateProjectPackage')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      // Updated endpoint and payload to align with new API (PATCH /projects/:projectId/package)
      const response = await this._request(`/projects/${projectId}/package`, {
        method: 'PATCH',
        body: JSON.stringify({ package: pkg }),
        methodName: 'updateProjectPackage'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project package: ${error.message}`, { cause: error })
    }
  }

  async duplicateProject (projectId, newName, newKey, targetUserId) {
    this._requireReady('duplicateProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: newName, key: newKey, targetUserId }),
        methodName: 'duplicateProject'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to duplicate project: ${error.message}`, { cause: error })
    }
  }

  async removeProject (projectId) {
    this._requireReady('removeProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}`, {
        method: 'DELETE',
        methodName: 'removeProject'
      })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove project: ${error.message}`, { cause: error })
    }
  }

  async transferProjectOwnership (projectId, { targetType, userId, organizationId }) {
    this._requireReady('transferProjectOwnership')
    if (!projectId) throw new Error('Project ID is required')
    if (!targetType) throw new Error('targetType is required (user or organization)')

    const response = await this._request(`/projects/${projectId}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ targetType, userId, organizationId }),
      methodName: 'transferProjectOwnership'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async transferProjectToWorkspace (projectId, targetWorkspaceId) {
    this._requireReady('transferProjectToWorkspace')
    if (!projectId) throw new Error('Project ID is required')
    if (!targetWorkspaceId) throw new Error('targetWorkspaceId is required')

    const response = await this._request(`/projects/${projectId}/transfer-workspace`, {
      method: 'POST',
      body: JSON.stringify({ targetWorkspaceId }),
      methodName: 'transferProjectToWorkspace'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async checkProjectKeyAvailability (key) {
    this._requireReady('checkProjectKeyAvailability')
    if (!key) {
      throw new Error('Project key is required')
    }
    try {
      const response = await this._request(`/projects/check-key/${key}`, {
        method: 'GET',
        methodName: 'checkProjectKeyAvailability'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(
        `Failed to check project key availability: ${error.message}`,
        { cause: error }
      )
    }
  }

  // ==================== PROJECT PERMISSION CONFIG METHODS ====================

  /**
   * Fetch effective role → permissions configuration for a project.
   * Mirrors ProjectController.getProjectRolePermissionsConfig.
   */
  async getProjectRolePermissionsConfig (projectId, options = {}) {
    this._requireReady('getProjectRolePermissionsConfig')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/permissions`, {
        method: 'GET',
        ...(headers ? { headers } : {}),
        methodName: 'getProjectRolePermissionsConfig'
      })

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(
        `Failed to get project role permissions config: ${error.message}`,
        { cause: error }
      )
    }
  }

  /**
   * Update project-level role → permissions overrides.
   * Mirrors ProjectController.updateProjectRolePermissionsConfig.
   */
  async updateProjectRolePermissionsConfig (projectId, rolePermissions, options = {}) {
    this._requireReady('updateProjectRolePermissionsConfig')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!rolePermissions || typeof rolePermissions !== 'object') {
      throw new Error('rolePermissions object is required')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ rolePermissions }),
        ...(headers ? { headers } : {}),
        methodName: 'updateProjectRolePermissionsConfig'
      })

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(
        `Failed to update project role permissions config: ${error.message}`,
        { cause: error }
      )
    }
  }

  // ==================== PROJECT MEMBER METHODS ====================

  async getProjectMembers (projectId) {
    this._requireReady('getProjectMembers')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/members`, {
        method: 'GET',
        methodName: 'getProjectMembers'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project members: ${error.message}`, { cause: error })
    }
  }

  async inviteMember (projectId, email, role = 'guest', options = {}) {
    this._requireReady('inviteMember')
    if (!projectId || !email || !role) {
      throw new Error('Project ID, email, and role are required')
    }

    const { name, callbackUrl, headers } = options

    // Default callbackUrl if not provided
    const defaultCallbackUrl =
      typeof window === 'undefined'
        ? 'https://app.symbols.com/accept-invite'
        : `${window.location.origin}/accept-invite`

    try {
      const requestBody = {
        email,
        role,
        callbackUrl: callbackUrl || defaultCallbackUrl
      }

      // Add optional name if provided
      if (name) {
        requestBody.name = name
      }

      const response = await this._request(`/projects/${projectId}/invite`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        ...(headers ? { headers } : {}),
        methodName: 'inviteMember'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to invite member: ${error.message}`, { cause: error })
    }
  }

  /**
   * Create a magic invite link for a project.
   * The backend returns a token and URL that can be shared directly.
   */
  async createMagicInviteLink (projectId, options = {}) {
    this._requireReady('createMagicInviteLink')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/invite-link`, {
        method: 'POST',
        ...(headers ? { headers } : {}),
        methodName: 'createMagicInviteLink'
      })

      if (response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create magic invite link: ${error.message}`, { cause: error })
    }
  }

  async acceptInvite (token) {
    this._requireReady('acceptInvite')
    if (!token) {
      throw new Error('Invitation token is required')
    }
    try {
      const response = await this._request('/projects/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token }),
        methodName: 'acceptInvite'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to accept invite: ${error.message}`, { cause: error })
    }
  }

  async updateMemberRole (projectId, memberId, role) {
    this._requireReady('updateMemberRole')
    if (!projectId || !memberId || !role) {
      throw new Error('Project ID, member ID, and role are required')
    }
    try {
      const response = await this._request(
        `/projects/${projectId}/members/${memberId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
          methodName: 'updateMemberRole'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update member role: ${error.message}`, { cause: error })
    }
  }

  async removeMember (projectId, memberId) {
    this._requireReady('removeMember')
    if (!projectId || !memberId) {
      throw new Error('Project ID and member ID are required')
    }
    try {
      const response = await this._request(
        `/projects/${projectId}/members/${memberId}`,
        {
          method: 'DELETE',
          methodName: 'removeMember'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove member: ${error.message}`, { cause: error })
    }
  }

  // ==================== PROJECT LIBRARY METHODS ====================

  async getAvailableLibraries (params = {}) {
    this._requireReady('getAvailableLibraries')
    const queryParams = new URLSearchParams(params).toString()
    try {
      const response = await this._request(
        `/projects/libraries/available?${queryParams}`,
        {
          method: 'GET',
          methodName: 'getAvailableLibraries'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get available libraries: ${error.message}`, { cause: error })
    }
  }

  async getProjectLibraries (projectId) {
    this._requireReady('getProjectLibraries')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/libraries`, {
        method: 'GET',
        methodName: 'getProjectLibraries'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project libraries: ${error.message}`, { cause: error })
    }
  }

  async addProjectLibraries (projectId, libraryIds) {
    this._requireReady('addProjectLibraries')
    if (!projectId || !libraryIds) {
      throw new Error('Project ID and library IDs are required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/libraries`, {
        method: 'POST',
        body: JSON.stringify({ libraryIds }),
        methodName: 'addProjectLibraries'
      })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to add project libraries: ${error.message}`, { cause: error })
    }
  }

  async removeProjectLibraries (projectId, libraryIds) {
    this._requireReady('removeProjectLibraries')
    if (!projectId || !libraryIds) {
      throw new Error('Project ID and library IDs are required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/libraries`, {
        method: 'DELETE',
        body: JSON.stringify({ libraryIds }),
        methodName: 'removeProjectLibraries'
      })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove project libraries: ${error.message}`, { cause: error })
    }
  }

  // ==================== PROJECT DATA METHODS (SYMSTORY REPLACEMENT) ====================

  /**
   * Apply changes to a project, creating a new version
   * Replaces: SymstoryService.updateData()
   */
  async applyProjectChanges (projectId, changes, options = {}) {
    this._requireReady('applyProjectChanges')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!Array.isArray(changes)) {
      throw new Error('Changes must be an array')
    }

    const { message, branch = 'main', type = 'patch', headers } = options

    // Preprocess into granular changes and derive orders using current state if available
    const state = this._context && this._context.state
    const { granularChanges, orders: preprocessorOrders } = preprocessChanges(state, changes, options)
    const derivedOrders = options.orders || (preprocessorOrders && preprocessorOrders.length
      ? preprocessorOrders
      : (state ? computeOrdersForTuples(state, granularChanges) : []))

    const stringify = (val) => deepStringifyFunctions(val, Array.isArray(val) ? [] : {})

    try {
      const response = await this._request(`/projects/${projectId}/changes`, {
        method: 'POST',
        body: JSON.stringify({
          changes: stringify(changes),
          granularChanges: stringify(granularChanges),
          message,
          branch,
          type,
          ...(derivedOrders && derivedOrders.length ? { orders: derivedOrders } : {})
        }),
        ...(headers ? { headers } : {}),
        methodName: 'applyProjectChanges'
      })

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to apply project changes: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get current project data for a specific branch
   * Replaces: SymstoryService.getData()
   */
  async getProjectData (projectId, options = {}) {
    this._requireReady('getProjectData')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const {
      branch = 'main',
      version = 'latest',
      includeHistory = false,
      headers
    } = options

    const queryParams = new URLSearchParams({
      branch,
      version,
      includeHistory: includeHistory.toString()
    }).toString()

    try {
      const response = await this._request(
        `/projects/${projectId}/data?${queryParams}`,
        {
          method: 'GET',
          methodName: 'getProjectData',
          ...(headers ? { headers } : {})
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project data: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get project versions with pagination
   */
  async getProjectVersions (projectId, options = {}) {
    this._requireReady('getProjectVersions')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { branch = 'main', page = 1, limit = 50, headers } = options

    const queryParams = new URLSearchParams({
      branch,
      page: page.toString(),
      limit: limit.toString()
    }).toString()

    try {
      const response = await this._request(
        `/projects/${projectId}/versions?${queryParams}`,
        {
          method: 'GET',
          methodName: 'getProjectVersions',
          ...(headers ? { headers } : {})
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project versions: ${error.message}`, { cause: error })
    }
  }

  // ==================== PROJECT ENVIRONMENT METHODS ====================

  /**
   * List all environments for a project along with plan limits and activation state.
   * Mirrors ProjectController.listEnvironments.
   */
  async listEnvironments (projectId, options = {}) {
    this._requireReady('listEnvironments')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/environments`, {
        method: 'GET',
        ...(headers ? { headers } : {}),
        methodName: 'listEnvironments'
      })

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list environments: ${error.message}`, { cause: error })
    }
  }

  /**
   * Create or update (upsert) an environment config for a project.
   * Mirrors ProjectController.upsertEnvironment.
   */
  async upsertEnvironment (projectId, envKey, config, options = {}) {
    this._requireReady('upsertEnvironment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!envKey) {
      throw new Error('Environment key is required')
    }
    if (!config || typeof config !== 'object') {
      throw new Error('Environment config object is required')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ envKey, config }),
        ...(headers ? { headers } : {}),
        methodName: 'upsertEnvironment'
      })

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to upsert environment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update an existing environment config.
   * Mirrors ProjectController.updateEnvironment.
   */
  async updateEnvironment (projectId, envKey, updates, options = {}) {
    this._requireReady('updateEnvironment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!envKey) {
      throw new Error('Environment key is required')
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Environment updates object is required')
    }

    const { headers } = options

    try {
      const response = await this._request(
        `/projects/${projectId}/environments/${encodeURIComponent(envKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
          ...(headers ? { headers } : {}),
          methodName: 'updateEnvironment'
        }
      )

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update environment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Publish a project to a specific environment (set its effective mode/version/branch).
   * Mirrors ProjectController.publishToEnvironment.
   */
  async publishToEnvironment (projectId, envKey, payload, options = {}) {
    this._requireReady('publishToEnvironment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!envKey) {
      throw new Error('Environment key is required')
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('Publish payload is required')
    }

    const { headers } = options

    try {
      const response = await this._request(
        `/projects/${projectId}/environments/${encodeURIComponent(envKey)}/publish`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
          ...(headers ? { headers } : {}),
          methodName: 'publishToEnvironment'
        }
      )

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to publish to environment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Delete an environment from a project.
   * Mirrors ProjectController.deleteEnvironment.
   */
  async deleteEnvironment (projectId, envKey, options = {}) {
    this._requireReady('deleteEnvironment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!envKey) {
      throw new Error('Environment key is required')
    }

    const { headers } = options

    try {
      const response = await this._request(
        `/projects/${projectId}/environments/${encodeURIComponent(envKey)}`,
        {
          method: 'DELETE',
          ...(headers ? { headers } : {}),
          methodName: 'deleteEnvironment'
        }
      )

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete environment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Promote content between environments (simple pipeline).
   * Mirrors ProjectController.promoteEnvironment.
   */
  async promoteEnvironment (projectId, fromEnvKey, toEnvKey, options = {}) {
    this._requireReady('promoteEnvironment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!fromEnvKey || !toEnvKey) {
      throw new Error('Both fromEnvKey and toEnvKey are required')
    }
    if (fromEnvKey === toEnvKey) {
      throw new Error('fromEnvKey and toEnvKey must be different')
    }

    const { headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/pipeline/promote`, {
        method: 'POST',
        body: JSON.stringify({ from: fromEnvKey, to: toEnvKey }),
        ...(headers ? { headers } : {}),
        methodName: 'promoteEnvironment'
      })

      if (response && response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to promote environment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Restore project to a previous version
   * Replaces: SymstoryService.restoreVersion()
   */
  async restoreProjectVersion (projectId, version, options = {}) {
    this._requireReady('restoreProjectVersion')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!version) {
      throw new Error('Version is required')
    }

    const { message, branch = 'main', type = 'patch', headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/restore`, {
        method: 'POST',
        body: JSON.stringify({
          version,
          message,
          branch,
          type
        }),
        ...(headers ? { headers } : {}),
        methodName: 'restoreProjectVersion'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to restore project version: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to update a single item in the project
   * Convenience wrapper around applyProjectChanges
   */
  async updateProjectItem (projectId, path, value, options = {}) {
    const changes = [['update', path, value]]
    const message =
      options.message ||
      `Updated ${Array.isArray(path) ? path.join('.') : path}`

    return await this.applyProjectChanges(projectId, changes, {
      ...options,
      message
    })
  }

  /**
   * Helper method to delete an item from the project
   * Convenience wrapper around applyProjectChanges
   */
  async deleteProjectItem (projectId, path, options = {}) {
    const changes = [['delete', path]]
    const message =
      options.message ||
      `Deleted ${Array.isArray(path) ? path.join('.') : path}`

    return await this.applyProjectChanges(projectId, changes, {
      ...options,
      message
    })
  }

  /**
   * Helper method to set a value in the project (alias for update)
   * Convenience wrapper around applyProjectChanges
   */
  async setProjectValue (projectId, path, value, options = {}) {
    const changes = [['set', path, value]]
    const message =
      options.message || `Set ${Array.isArray(path) ? path.join('.') : path}`

    return await this.applyProjectChanges(projectId, changes, {
      ...options,
      message
    })
  }

  /**
   * Helper method to add multiple items to the project
   * Convenience wrapper around applyProjectChanges
   */
  async addProjectItems (projectId, items, options = {}) {
    const changes = items
      .map(item => {
        const [type, data] = item
        const { value, ...schema } = data
        return [
          ['update', [type, data.key], value],
          ['update', ['schema', type, data.key], schema]
        ]
      })
      .flat()

    const message = options.message || `Added ${items.length} items`

    return await this.applyProjectChanges(projectId, changes, {
      ...options,
      message
    })
  }

  /**
   * Helper method to get specific data from project by path
   * Convenience wrapper that gets project data and extracts specific path
   */
  async getProjectItemByPath (projectId, path, options = {}) {
    const projectData = await this.getProjectData(projectId, options)

    if (!projectData?.data) {
      return null
    }

    // Navigate to the specific path in the data
    let current = projectData.data
    const pathArray = Array.isArray(path) ? path : [path]

    for (const segment of pathArray) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment]
      } else {
        return null
      }
    }

    return current
  }

  // ==================== FAVORITE PROJECT METHODS ====================

  async getFavoriteProjects () {
    this._requireReady('getFavoriteProjects')
    try {
      const response = await this._request('/users/favorites', {
        method: 'GET',
        methodName: 'getFavoriteProjects'
      })

      if (response.success) {
        // Ensure each project has proper icon src like other project lists
        return (response.data || []).map(project => ({
          isFavorite: true,
          ...project,
          ...(project.icon && {
            icon: {
              src: `${this._apiUrl}/core/files/public/${project.icon.id}/download`,
              ...project.icon
            }
          })
        }))
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get favorite projects: ${error.message}`, { cause: error })
    }
  }

  async addFavoriteProject (projectId) {
    this._requireReady('addFavoriteProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/users/favorites/${projectId}`, {
        method: 'POST',
        methodName: 'addFavoriteProject'
      })

      if (response.success) {
        return response.data
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to add favorite project: ${error.message}`, { cause: error })
    }
  }

  async removeFavoriteProject (projectId) {
    this._requireReady('removeFavoriteProject')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/users/favorites/${projectId}`, {
        method: 'DELETE',
        methodName: 'removeFavoriteProject'
      })

      if (response.success) {
        return response.message || 'Project removed from favorites'
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove favorite project: ${error.message}`, { cause: error })
    }
  }

  // ==================== RECENT PROJECT METHODS ====================

  async getRecentProjects (options = {}) {
    this._requireReady('getRecentProjects')

    const { limit = 20, headers } = options
    const queryString = new URLSearchParams({
      limit: limit.toString()
    }).toString()

    try {
      // Inline both branches so the analyzer matches /users/projects/recent.
      const response = queryString
        ? await this._request(`/users/projects/recent?${queryString}`, {
          method: 'GET',
          ...(headers ? { headers } : {}),
          methodName: 'getRecentProjects'
        })
        : await this._request('/users/projects/recent', {
          method: 'GET',
          ...(headers ? { headers } : {}),
          methodName: 'getRecentProjects'
        })

      if (response.success) {
        // Map icon src similar to other project lists
        return (response.data || []).map(item => ({
          ...item.project,
          ...(item.project &&
            item.project.icon && {
            icon: {
              src: `${this._apiUrl}/core/files/public/${item.project.icon.id}/download`,
              ...item.project.icon
            }
          })
        }))
      }

      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get recent projects: ${error.message}`, { cause: error })
    }
  }

  // ==================== RESOURCE ENUMERATION ====================
  //
  // Read-only resource listings (components / functions / pages) for a
  // given project. Two addressing modes — by numeric/ObjectId id, or by
  // bare project key. The key-based routes are 1-seg on the server
  // today; see 🤝 REQUEST → SERVER in NEEDED_FOR_SDK.md for the 2-seg
  // follow-up (post-§45 collision safety).
  //
  // Response envelope follows the server convention:
  //   { success: true, data: [ { id, name, ... } ], total? }
  // Fails-soft to `{ items: [] }` on non-success so UIs don't crash when
  // the server is briefly unreachable.

  /**
   * List all component resources for a project by id.
   * @param {string} projectId
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectComponents (projectId) {
    this._requireReady('getProjectComponents')
    if (!projectId) throw new Error('projectId is required')
    const response = await this._request(
      `/projects/${encodeURIComponent(projectId)}/resources/components`,
      { method: 'GET', methodName: 'getProjectComponents' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  /**
   * List all function resources for a project by id.
   * @param {string} projectId
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectFunctions (projectId) {
    this._requireReady('getProjectFunctions')
    if (!projectId) throw new Error('projectId is required')
    const response = await this._request(
      `/projects/${encodeURIComponent(projectId)}/resources/functions`,
      { method: 'GET', methodName: 'getProjectFunctions' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  /**
   * List all page resources for a project by id.
   * @param {string} projectId
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectPages (projectId) {
    this._requireReady('getProjectPages')
    if (!projectId) throw new Error('projectId is required')
    const response = await this._request(
      `/projects/${encodeURIComponent(projectId)}/resources/pages`,
      { method: 'GET', methodName: 'getProjectPages' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  /**
   * List all component resources for a project by key. Today the server
   * only exposes the 1-seg variant; pass a bare key (string) or
   * `{ key }` object. `{ owner, key }` is accepted for forward-compat
   * but currently hits the 1-seg route (owner segment is a no-op).
   * @param {string | { owner?: string, key: string }} projectKey
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectComponentsByKey (projectKey) {
    this._requireReady('getProjectComponentsByKey')
    if (!projectKey) throw new Error('projectKey is required')
    const response = await this._request(
      `/projects/key/${keyPath(projectKey)}/resources/components`,
      { method: 'GET', methodName: 'getProjectComponentsByKey' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  /**
   * List all function resources for a project by key. See
   * `getProjectComponentsByKey` for the key-shape contract.
   * @param {string | { owner?: string, key: string }} projectKey
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectFunctionsByKey (projectKey) {
    this._requireReady('getProjectFunctionsByKey')
    if (!projectKey) throw new Error('projectKey is required')
    const response = await this._request(
      `/projects/key/${keyPath(projectKey)}/resources/functions`,
      { method: 'GET', methodName: 'getProjectFunctionsByKey' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  /**
   * List all page resources for a project by key. See
   * `getProjectComponentsByKey` for the key-shape contract.
   * @param {string | { owner?: string, key: string }} projectKey
   * @returns {Promise<{items: Array<object>, total?: number}>}
   */
  async getProjectPagesByKey (projectKey) {
    this._requireReady('getProjectPagesByKey')
    if (!projectKey) throw new Error('projectKey is required')
    const response = await this._request(
      `/projects/key/${keyPath(projectKey)}/resources/pages`,
      { method: 'GET', methodName: 'getProjectPagesByKey' }
    )
    if (response?.success) return response
    return { items: [] }
  }

  // ==================== OWNERSHIP (admin-only) ====================
  //
  // Global-admin-only endpoints for auditing + fixing project ownership.
  // Surfaced on the SDK so internal admin UIs and ops scripts can hit
  // them without hand-rolling fetches. All three reject with 403 for
  // non-admins on the server side.

  /**
   * List projects with their ownership status. Admin-only on the server.
   * Useful for finding orphaned projects (no owner) or auditing a specific
   * owner's footprint.
   *
   * @param {{ hasOwner?: 'true' | 'false', search?: string, page?: number, limit?: number }} [params]
   * @returns {Promise<{success: boolean, data: {items: Array<object>, total: number, page: number, limit: number}}>}
   */
  async listProjectOwnership (params = {}) {
    this._requireReady('listProjectOwnership')
    const qs = new URLSearchParams()
    Object.keys(params).forEach((k) => {
      if (params[k] != null) qs.append(k, String(params[k]))
    })
    const queryString = qs.toString()
    const response = queryString
      ? await this._request(`/projects/ownership?${queryString}`, {
        method: 'GET',
        methodName: 'listProjectOwnership'
      })
      : await this._request('/projects/ownership', {
        method: 'GET',
        methodName: 'listProjectOwnership'
      })
    if (response?.success) return response
    return { success: false, data: { items: [], total: 0 } }
  }

  /**
   * Assign a specific user as project owner. Admin-only on the server.
   * If another owner exists they are downgraded to admin. Identifies the
   * target project by id OR key, and the target user by id OR email.
   *
   * @param {{ projectId?: string, projectKey?: string, userId?: string, email?: string }} args
   * @returns {Promise<object>} - server response envelope
   */
  async assignProjectOwner (args = {}) {
    this._requireReady('assignProjectOwner')
    if (!args.projectId && !args.projectKey) {
      throw new Error('projectId or projectKey is required')
    }
    if (!args.userId && !args.email) {
      throw new Error('userId or email is required')
    }
    const response = await this._request('/projects/ownership/assign', {
      method: 'POST',
      body: JSON.stringify(args),
      methodName: 'assignProjectOwner'
    })
    if (response?.success) return response
    throw new Error(response?.message || 'Failed to assign project owner')
  }

  /**
   * Bulk-promote the earliest-joined admin of each ownerless project to
   * owner. Admin-only. Returns counts + per-project error list.
   *
   * @param {{ limit?: number, skipProjectIds?: Array<string> }} [args]
   * @returns {Promise<{success: boolean, data: {processed: number, updated: number, skipped: number, errors: Array<object>}}>}
   */
  async autoAssignProjectOwners (args = {}) {
    this._requireReady('autoAssignProjectOwners')
    const response = await this._request('/projects/ownership/auto-assign', {
      method: 'POST',
      body: JSON.stringify(args),
      methodName: 'autoAssignProjectOwners'
    })
    if (response?.success) return response
    throw new Error(response?.message || 'Failed to auto-assign project owners')
  }
}
