import { BaseService } from './BaseService.js'

export class BranchService extends BaseService {
  // ==================== BRANCH MANAGEMENT METHODS ====================

  /**
   * Get all branches for a project
   */
  async listBranches (projectId) {
    this._requireReady('listBranches')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/branches`, {
        method: 'GET',
        methodName: 'listBranches'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list branches: ${error.message}`, { cause: error })
    }
  }

  /**
   * Create a new branch from an existing branch
   */
  async createBranch (projectId, branchData) {
    this._requireReady('createBranch')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchData.name) {
      throw new Error('Branch name is required')
    }

    const { name, source = 'main' } = branchData

    try {
      const response = await this._request(`/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name, source }),
        methodName: 'createBranch'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create branch: ${error.message}`, { cause: error })
    }
  }

  /**
   * Delete a branch (cannot delete main branch)
   */
  async deleteBranch (projectId, branchName) {
    this._requireReady('deleteBranch')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchName) {
      throw new Error('Branch name is required')
    }
    if (branchName === 'main') {
      throw new Error('Cannot delete main branch')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/branches/${encodeURIComponent(branchName)}`,
        {
          method: 'DELETE',
          methodName: 'deleteBranch'
        }
      )
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete branch: ${error.message}`, { cause: error })
    }
  }

  /**
   * Rename a branch (cannot rename main branch)
   */
  async renameBranch (projectId, branchName, newName) {
    this._requireReady('renameBranch')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchName) {
      throw new Error('Current branch name is required')
    }
    if (!newName) {
      throw new Error('New branch name is required')
    }
    if (branchName === 'main') {
      throw new Error('Cannot rename main branch')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/branches/${encodeURIComponent(
          branchName
        )}/rename`,
        {
          method: 'POST',
          body: JSON.stringify({ newName }),
          methodName: 'renameBranch'
        }
      )
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to rename branch: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get changes/diff for a branch compared to another version
   */
  async getBranchChanges (projectId, branchName = 'main', options = {}) {
    this._requireReady('getBranchChanges')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchName) {
      throw new Error('Branch name is required')
    }

    const { versionId, versionValue, target } = options
    const queryParams = new URLSearchParams()

    if (versionId) {
      queryParams.append('versionId', versionId)
    }
    if (versionValue) {
      queryParams.append('versionValue', versionValue)
    }
    if (target) {
      queryParams.append('target', target)
    }

    const queryString = queryParams.toString()
    const url = `/projects/${projectId}/branches/${encodeURIComponent(
      branchName
    )}/changes${queryString ? `?${queryString}` : ''}`

    try {
      const response = await this._request(url, {
        method: 'GET',
        methodName: 'getBranchChanges'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get branch changes: ${error.message}`, { cause: error })
    }
  }

  /**
   * Merge changes between branches (preview or commit)
   */
  async mergeBranch (projectId, branchName, mergeData = {}) {
    this._requireReady('mergeBranch')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchName) {
      throw new Error('Source branch name is required')
    }

    const {
      target = 'main',
      message,
      type = 'patch',
      commit = false,
      changes
    } = mergeData

    const requestBody = {
      target,
      type,
      commit,
      ...(message && { message }),
      ...(changes && { changes })
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/branches/${encodeURIComponent(
          branchName
        )}/merge`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          methodName: 'mergeBranch'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      // Handle merge conflicts specifically
      if (
        error.message.includes('conflicts') ||
        error.message.includes('409')
      ) {
        throw new Error(`Merge conflicts detected: ${error.message}`, { cause: error })
      }
      throw new Error(`Failed to merge branch: ${error.message}`, { cause: error })
    }
  }

  /**
   * Reset a branch to a clean state
   */
  async resetBranch (projectId, branchName) {
    this._requireReady('resetBranch')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!branchName) {
      throw new Error('Branch name is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/branches/${encodeURIComponent(
          branchName
        )}/reset`,
        {
          method: 'POST',
          methodName: 'resetBranch'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to reset branch: ${error.message}`, { cause: error })
    }
  }

  /**
   * Publish a specific version as the live version
   */
  async publishVersion (projectId, publishData) {
    this._requireReady('publishVersion')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!publishData.version) {
      throw new Error('Version is required')
    }

    const { version, branch = 'main' } = publishData

    try {
      const response = await this._request(`/projects/${projectId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ version, branch }),
        methodName: 'publishVersion'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to publish version: ${error.message}`, { cause: error })
    }
  }

  // ==================== BRANCH HELPER METHODS ====================

  /**
   * Helper method to create a branch with validation
   */
  async createBranchWithValidation (projectId, name, source = 'main') {
    // Basic validation
    if (!name || name.trim().length === 0) {
      throw new Error('Branch name cannot be empty')
    }

    if (name.includes(' ')) {
      throw new Error('Branch name cannot contain spaces')
    }

    if (name === 'main') {
      throw new Error('Cannot create a branch named "main"')
    }

    const sanitizedName = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/gu, '-')

    return await this.createBranch(projectId, {
      name: sanitizedName,
      source
    })
  }

  /**
   * Helper method to check if a branch exists
   */
  async branchExists (projectId, branchName) {
    try {
      const branches = await this.listBranches(projectId)
      return branches?.data?.includes(branchName) || false
    } catch (error) {
      throw new Error(`Failed to check if branch exists: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to preview merge without committing
   */
  async previewMerge (projectId, sourceBranch, targetBranch = 'main') {
    return await this.mergeBranch(projectId, sourceBranch, {
      target: targetBranch,
      commit: false
    })
  }

  /**
   * Helper method to commit merge after preview
   */
  async commitMerge (projectId, sourceBranch, options = {}) {
    const {
      target = 'main',
      message = `Merge ${sourceBranch} into ${target}`,
      type = 'patch',
      changes
    } = options

    return await this.mergeBranch(projectId, sourceBranch, {
      target,
      message,
      type,
      commit: true,
      changes
    })
  }

  /**
   * Helper method to create a feature branch from main
   */
  async createFeatureBranch (projectId, featureName) {
    const branchName = `feature/${featureName
      .toLowerCase()
      .replace(/[^a-z0-9-]/gu, '-')}`

    return await this.createBranch(projectId, {
      name: branchName,
      source: 'main'
    })
  }

  /**
   * Helper method to create a hotfix branch from main
   */
  async createHotfixBranch (projectId, hotfixName) {
    const branchName = `hotfix/${hotfixName
      .toLowerCase()
      .replace(/[^a-z0-9-]/gu, '-')}`

    return await this.createBranch(projectId, {
      name: branchName,
      source: 'main'
    })
  }

  /**
   * Helper method to get branch status summary
   */
  async getBranchStatus (projectId, branchName) {
    try {
      const [branches, changes] = await Promise.all([
        this.listBranches(projectId),
        this.getBranchChanges(projectId, branchName).catch(() => null)
      ])

      const exists = branches?.data?.includes(branchName) || false
      const hasChanges = changes?.data?.length > 0

      return {
        exists,
        hasChanges,
        changeCount: changes?.data?.length || 0,
        canDelete: exists && branchName !== 'main',
        canRename: exists && branchName !== 'main'
      }
    } catch (error) {
      throw new Error(`Failed to get branch status: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to safely delete a branch with confirmation
   */
  async deleteBranchSafely (projectId, branchName, options = {}) {
    const { force = false } = options

    if (!force) {
      const status = await this.getBranchStatus(projectId, branchName)

      if (!status.exists) {
        throw new Error(`Branch '${branchName}' does not exist`)
      }

      if (!status.canDelete) {
        throw new Error(`Branch '${branchName}' cannot be deleted`)
      }

      if (status.hasChanges) {
        throw new Error(
          `Branch '${branchName}' has uncommitted changes. Use force option to delete anyway.`
        )
      }
    }

    return await this.deleteBranch(projectId, branchName)
  }

  /**
   * Helper method to get all branches with their status
   */
  async getBranchesWithStatus (projectId) {
    try {
      const branches = await this.listBranches(projectId)
      const branchList = branches?.data || []

      const branchStatuses = await Promise.all(
        branchList.map(async branchName => {
          try {
            const status = await this.getBranchStatus(projectId, branchName)
            return {
              name: branchName,
              ...status
            }
          } catch (error) {
            return {
              name: branchName,
              exists: true,
              hasChanges: false,
              changeCount: 0,
              canDelete: branchName !== 'main',
              canRename: branchName !== 'main',
              error: error.message
            }
          }
        })
      )

      return branchStatuses
    } catch (error) {
      throw new Error(`Failed to get branches with status: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to validate branch name
   */
  validateBranchName (branchName) {
    if (!branchName || typeof branchName !== 'string') {
      return {
        isValid: false,
        error: 'Branch name must be a non-empty string'
      }
    }

    if (branchName.trim().length === 0) {
      return {
        isValid: false,
        error: 'Branch name cannot be empty'
      }
    }

    if (branchName.includes(' ')) {
      return {
        isValid: false,
        error: 'Branch name cannot contain spaces'
      }
    }

    if (branchName === 'main') {
      return {
        isValid: false,
        error: 'Cannot use "main" as a branch name'
      }
    }

    // Check for valid characters (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9-_]+$/u.test(branchName)) {
      return {
        isValid: false,
        error: 'Branch name can only contain letters, numbers, hyphens, and underscores'
      }
    }

    return {
      isValid: true,
      error: null
    }
  }

  /**
   * Helper method to sanitize branch name
   */
  sanitizeBranchName (branchName) {
    if (!branchName) {
      return ''
    }

    return branchName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^-|-$/gu, '')
  }
}
