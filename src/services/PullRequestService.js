import { BaseService } from './BaseService.js'

export class PullRequestService extends BaseService {
  // ==================== PULL REQUEST METHODS ====================

  /**
   * Create a new pull request
   */
  async createPullRequest (projectId, pullRequestData) {
    this._requireReady('createPullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (
      !pullRequestData.source ||
      !pullRequestData.target ||
      !pullRequestData.title
    ) {
      throw new Error('Source branch, target branch, and title are required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests`,
        {
          method: 'POST',
          body: JSON.stringify(pullRequestData),
          methodName: 'createPullRequest'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error.message}`, { cause: error })
    }
  }

  /**
   * List pull requests for a project with filtering options
   */
  async listPullRequests (projectId, options = {}) {
    this._requireReady('listPullRequests')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { status = 'open', source, target, page = 1, limit = 20 } = options

    const queryParams = new URLSearchParams({
      status,
      page: page.toString(),
      limit: limit.toString()
    })

    if (source) {
      queryParams.append('source', source)
    }
    if (target) {
      queryParams.append('target', target)
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests?${queryParams.toString()}`,
        {
          method: 'GET',
          methodName: 'listPullRequests'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list pull requests: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get detailed information about a specific pull request
   */
  async getPullRequest (projectId, prId) {
    this._requireReady('getPullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}`,
        {
          method: 'GET',
          methodName: 'getPullRequest'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get pull request: ${error.message}`, { cause: error })
    }
  }

  /**
   * Submit a review for a pull request
   */
  async reviewPullRequest (projectId, prId, reviewData) {
    this._requireReady('reviewPullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    const validStatuses = ['approved', 'requested_changes', 'feedback']
    if (reviewData.status && !validStatuses.includes(reviewData.status)) {
      throw new Error(
        `Invalid review status. Must be one of: ${validStatuses.join(', ')}`
      )
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/review`,
        {
          method: 'POST',
          body: JSON.stringify(reviewData),
          methodName: 'reviewPullRequest'
        }
      )
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to review pull request: ${error.message}`, { cause: error })
    }
  }

  /**
   * Add a comment to an existing review thread
   */
  async addPullRequestComment (projectId, prId, commentData) {
    this._requireReady('addPullRequestComment')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }
    if (!commentData.value) {
      throw new Error('Comment value is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/comment`,
        {
          method: 'POST',
          body: JSON.stringify(commentData),
          methodName: 'addPullRequestComment'
        }
      )
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to add pull request comment: ${error.message}`, { cause: error })
    }
  }

  /**
   * Merge an approved pull request
   */
  async mergePullRequest (projectId, prId) {
    this._requireReady('mergePullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/merge`,
        {
          method: 'POST',
          methodName: 'mergePullRequest'
        }
      )

      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      // Handle specific merge conflict errors
      if (
        error.message.includes('conflicts') ||
        error.message.includes('409')
      ) {
        throw new Error(`Pull request has merge conflicts: ${error.message}`, { cause: error })
      }
      throw new Error(`Failed to merge pull request: ${error.message}`, { cause: error })
    }
  }

  /**
   * Get the diff/changes for a pull request
   */
  async getPullRequestDiff (projectId, prId) {
    this._requireReady('getPullRequestDiff')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/diff`,
        {
          method: 'GET',
          methodName: 'getPullRequestDiff'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get pull request diff: ${error.message}`, { cause: error })
    }
  }

  // ==================== PULL REQUEST HELPER METHODS ====================

  /**
   * Helper method to create a pull request with validation
   */
  async createPullRequestWithValidation (projectId, data) {
    const { source, target, title, description, changes } = data

    // Basic validation
    if (source === target) {
      throw new Error('Source and target branches cannot be the same')
    }

    if (!title || title.trim().length === 0) {
      throw new Error('Pull request title cannot be empty')
    }

    if (title.length > 200) {
      throw new Error('Pull request title cannot exceed 200 characters')
    }

    const pullRequestData = {
      source: source.trim(),
      target: target.trim(),
      title: title.trim(),
      ...(description && { description: description.trim() }),
      ...(changes && { changes })
    }

    return await this.createPullRequest(projectId, pullRequestData)
  }

  /**
   * Helper method to approve a pull request
   */
  async approvePullRequest (projectId, prId, comment = '') {
    const reviewData = {
      status: 'approved',
      ...(comment && {
        threads: [
          {
            comment,
            type: 'praise'
          }
        ]
      })
    }

    return await this.reviewPullRequest(projectId, prId, reviewData)
  }

  /**
   * Helper method to request changes on a pull request
   */
  async requestPullRequestChanges (projectId, prId, threads = []) {
    if (!threads || threads.length === 0) {
      throw new Error('Must provide specific feedback when requesting changes')
    }

    const reviewData = {
      status: 'requested_changes',
      threads
    }

    return await this.reviewPullRequest(projectId, prId, reviewData)
  }

  /**
   * Helper method to get pull requests by status
   */
  async getOpenPullRequests (projectId, options = {}) {
    return await this.listPullRequests(projectId, {
      ...options,
      status: 'open'
    })
  }

  async getClosedPullRequests (projectId, options = {}) {
    return await this.listPullRequests(projectId, {
      ...options,
      status: 'closed'
    })
  }

  async getMergedPullRequests (projectId, options = {}) {
    return await this.listPullRequests(projectId, {
      ...options,
      status: 'merged'
    })
  }

  /**
   * Helper method to check if a pull request is canMerge
   */
  async isPullRequestMergeable (projectId, prId) {
    try {
      const prData = await this.getPullRequest(projectId, prId)
      return prData?.data?.canMerge || false
    } catch (error) {
      throw new Error(
        `Failed to check pull request mergeability: ${error.message}`, { cause: error }
      )
    }
  }

  /**
   * Helper method to get pull request status summary
   */
  async getPullRequestStatusSummary (projectId, prId) {
    try {
      const prData = await this.getPullRequest(projectId, prId)
      const pr = prData?.data

      if (!pr) {
        throw new Error('Pull request not found')
      }

      return {
        status: pr.status,
        reviewStatus: pr.reviewStatus,
        canMerge: pr.canMerge,
        hasConflicts: !pr.canMerge,
        reviewCount: pr.reviews?.length || 0,
        approvedReviews:
          pr.reviews?.filter(r => r.status === 'approved').length || 0,
        changesRequested:
          pr.reviews?.filter(r => r.status === 'requested_changes').length || 0
      }
    } catch (error) {
      throw new Error(
        `Failed to get pull request status summary: ${error.message}`, { cause: error }
      )
    }
  }

  /**
   * Helper method to validate pull request data
   */
  validatePullRequestData (data) {
    const errors = []

    if (!data.source || typeof data.source !== 'string') {
      errors.push('Source branch is required and must be a string')
    }

    if (!data.target || typeof data.target !== 'string') {
      errors.push('Target branch is required and must be a string')
    }

    if (data.source === data.target) {
      errors.push('Source and target branches cannot be the same')
    }

    if (!data.title || typeof data.title !== 'string') {
      errors.push('Title is required and must be a string')
    } else if (data.title.trim().length === 0) {
      errors.push('Title cannot be empty')
    } else if (data.title.length > 200) {
      errors.push('Title cannot exceed 200 characters')
    }

    if (data.description && typeof data.description !== 'string') {
      errors.push('Description must be a string')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Helper method to validate review data
   */
  validateReviewData (reviewData) {
    const errors = []

    const validStatuses = ['approved', 'requested_changes', 'feedback']
    if (reviewData.status && !validStatuses.includes(reviewData.status)) {
      errors.push(`Invalid review status. Must be one of: ${validStatuses.join(', ')}`)
    }

    if (reviewData.threads && !Array.isArray(reviewData.threads)) {
      errors.push('Threads must be an array')
    }

    if (reviewData.threads) {
      reviewData.threads.forEach((thread, index) => {
        if (!thread.comment || typeof thread.comment !== 'string') {
          errors.push(`Thread ${index + 1}: Comment is required and must be a string`)
        }
        if (thread.type && !['praise', 'issue', 'suggestion'].includes(thread.type)) {
          errors.push(`Thread ${index + 1}: Invalid thread type`)
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Helper method to get pull request statistics
   */
  async getPullRequestStats (projectId, options = {}) {
    try {
      const { status = 'open' } = options
      const pullRequests = await this.listPullRequests(projectId, { status })

      const stats = {
        total: pullRequests.length,
        open: 0,
        closed: 0,
        merged: 0,
        withConflicts: 0,
        readyToMerge: 0
      }

      pullRequests.forEach(pr => {
        if (pr.status === 'open') {stats.open++}
        if (pr.status === 'closed') {stats.closed++}
        if (pr.status === 'merged') {stats.merged++}
        if (pr.hasConflicts) {stats.withConflicts++}
        if (pr.canMerge) {stats.readyToMerge++}
      })

      return stats
    } catch (error) {
      throw new Error(`Failed to get pull request stats: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to close a pull request
   */
  async closePullRequest (projectId, prId) {
    this._requireReady('closePullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/close`,
        {
          method: 'POST',
          methodName: 'closePullRequest'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to close pull request: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to reopen a closed pull request
   */
  async reopenPullRequest (projectId, prId) {
    this._requireReady('reopenPullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!prId) {
      throw new Error('Pull request ID is required')
    }

    try {
      const response = await this._request(
        `/projects/${projectId}/pull-requests/${prId}/reopen`,
        {
          method: 'POST',
          methodName: 'reopenPullRequest'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to reopen pull request: ${error.message}`, { cause: error })
    }
  }
}
