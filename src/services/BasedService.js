import { BaseService } from './BaseService.js'
import { buildProjectQuery, buildUserQuery, buildGetProjectsByKeysQuery, buildGetUserDataQuery, buildGetProjectDataQuery, buildGetProjectByKeyDataQuery } from '../utils/basedQuerys.js'
import Based from '@based/client'
import { isFunction, isString } from '@domql/utils'
import environment from '../config/environment.js'

// DEPRECATED
export class BasedService extends BaseService {
  constructor (config) {
    super(config)
    this._client = null
    this._subscriptions = new Map()
  }

  init ({ context }) {
    try {
      const { env, org, project } = context.based || {
        env: environment.basedEnv,
        org: environment.basedOrg,
        project: environment.basedProject
      }

      if (!env || !org || !project) {
        throw new Error('Based configuration missing required parameters')
      }

      this._client = new Based({
        env,
        org,
        project
      })

      this._info = {
        config: {
          env,
          org: this._maskString(org),
          project: this._maskString(project)
        }
      }

      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  // Helper method to mask sensitive strings

  _maskString (str) {
    if (!str) {
      return ''
    }
    return `${str.substr(0, 4)}...${str.substr(-4)}`
  }

  updateContext (context) {
    this._context = { ...this._context, ...context }
    if (this._context.authToken && this._context.user?.id) {
      this.setAuthState(this._context.authToken, this._context.user.id)
    }
  }

  async setAuthState (authState) {
    this._requireReady()
    const newAuthState = {
      ...authState,
      persistent: true
    }
    try {
      return await this._client.setAuthState(newAuthState)
    } catch (error) {
      throw new Error(`Failed to set auth state: ${error.message}`)
    }
  }

  async setBucket (bucketId, callback) {
    this._requireReady()

    if (!isString(bucketId)) {
      throw new Error('Invalid type of bucket ID', bucketId)
    }
    if (!this._context.project) {
      throw new Error('Project is undefined')
    }
    try {
      const obj = {
        $id: this._context.project.id, // TODO: change to getProjectId
        bucket: bucketId
      }
      if (isFunction(callback)) {
        const data = await this._client.call('db:set', obj)
        return callback(data)
      }
      return await this._client.call('db:set', obj)
    } catch (error) {
      throw new Error(`Failed to set bucket: ${error.message}`)
    }
  }

  async setUserForced (userId, obj) {
    this._requireReady()

    try {
      await this._client
        .query('db', {
          $id: obj.projectId,
          members: {
            $list: true,
            user: {
              id: true
            }
          }
        })
        .get()

      // Create ProjectMember entry
      const { id: membershipId } = await this._client.call('db:set', {
        type: 'projectMember',
        user: userId,
        project: obj.projectId,
        role: obj.role,
        joinedAt: Date.now()
      })

      return await Promise.all([
        this._client.call('db:set', {
          $id: userId,
          memberProjects: { $add: membershipId }
        }),
        this._client.call('db:set', {
          $id: obj.projectId,
          members: { $add: membershipId }
        })
      ])
    } catch (error) {
      throw new Error(`Failed to set bucket: ${error.message}`)
    }
  }

  async query (collection, query, options = {}) {
    this._requireReady()
    try {
      return await this._client
        .query(collection, query, {
          ...options,
          context: this._context
        })
        .get()
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`)
    }
  }

  async setProject (params) {
    this._requireReady()
    try {
      return await this._client.call('db:set', {
        type: 'project',
        ...params
      })
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`)
    }
  }

  async setUser (params) {
    this._requireReady()
    try {
      return await this._client.call('db:set', {
        type: 'user',
        ...params
      })
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`)
    }
  }

  // DEPRECATED
  async fetchUser (userId) {
    if (!userId) {
      throw new Error('User Id is required')
    }
    return await this.query('db', buildUserQuery(userId))
  }

  async getUser (userId) {
    if (!userId) {
      throw new Error("UserId is required")
    }

    // Get user data and memberProjects in a single query
    const userData = await this._client
      .query("db", buildGetUserDataQuery(userId))
      .get()

    // Extract user data
    const user = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      username: userData.username,
      globalRole: userData.globalRole,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt
    }

    if (!user) {
      throw new Error("User not found")
    }

    let memberProjects = []

    if (userData.memberProjects && userData.memberProjects.length > 0) {
      // Extract project keys from the direct query
      const projectKeys = userData.memberProjects
        .filter(membership => membership.project && membership.project.key)
        .map(membership => membership.project.key)

      if (projectKeys.length > 0) {
        // Fetch projects in chunks to avoid PayloadTooLarge errors
        const allProjects = await this._fetchProjectsByKeysInChunks(projectKeys)

        // Map the project data with original membership data
        memberProjects = userData.memberProjects
          .filter(membership => membership.project && membership.project.key)
          .map(membership => {
            const projectKey = membership.project.key
            const correctProject = allProjects.find(
              p => p.key === projectKey
            )

            return {
              project: correctProject || membership.project,
              role: membership.role,
              updatedAt: membership.updatedAt,
              createdAt: membership.createdAt
            }
          })
      }
    } else {
      console.log(`[getUser] No member projects found with ID: ${userId}`)
    }

    // Format projects data
    const formattedProjects =
      memberProjects
        .filter(membership => membership.project)
        .map(membership => ({
          id: membership.project.id,
          name: membership.project.name,
          key: membership.project.key,
          thumbnail: membership.project.thumbnail,
          icon: membership.project.icon,
          tier: membership.project.tier,
          visibility: membership.project.visibility,
          access: membership.project.access,
          role: membership.role,
          joinedAt: membership.createdAt,
          updatedAt: membership.updatedAt,
          members: membership.project.members
        })) || []

    return {
      id: userId,
      name: user.name,
      email: user.email,
      username: user.username,
      globalRole: user.globalRole,
      projects: formattedProjects,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  }

  /**
   * Fetches projects by keys in chunks with adaptive chunk sizing
   * @param {Array<string>} allKeys - All project keys to fetch
   * @returns {Promise<Array>} - All projects found
   */
  async _fetchProjectsByKeysInChunks(allKeys) {
    if (!allKeys.length) {return []}

    // Initial chunk size and limits
    const INITIAL_CHUNK_SIZE = 50
    const MAX_CHUNK_SIZE = 1000
    const MIN_CHUNK_SIZE = 10

    // Track the optimal chunk size as we learn from responses
    const optimalChunkSize = INITIAL_CHUNK_SIZE

    /**
     * Recursively process chunks of keys with adaptive sizing
     * @param {Array<string>} keys - Keys to process
     * @param {number} size - Current chunk size
     * @returns {Promise<Array>} - Projects found
     */
    const processChunks = async (keys, size) => {
      if (!keys.length) {return []}

      const chunks = []
      for (let i = 0; i < keys.length; i += size) {
        chunks.push(keys.slice(i, i + size))
      }

      try {
        const result = await this._client
          .query("db", buildGetProjectsByKeysQuery(chunks[0]))
          .get()

        const newSize = Math.min(Math.floor(size * 1.5), MAX_CHUNK_SIZE)

        const firstChunkProjects = result.projects || []

        const remainingKeys = keys.slice(chunks[0].length)
        const remainingProjects = await processChunks(remainingKeys, newSize)

        return [...firstChunkProjects, ...remainingProjects]
      } catch (error) {
        if (error.message && error.message.includes('PayloadTooLarge')) {
          const newSize = Math.max(Math.floor(size / 2), MIN_CHUNK_SIZE)
          console.warn(`Reducing chunk size to ${newSize} due to PayloadTooLarge error`)

          if (newSize === MIN_CHUNK_SIZE && chunks[0].length <= MIN_CHUNK_SIZE) {
            console.error(`Cannot process chunk, skipping ${chunks[0].length} keys`)
            const remainingKeys = keys.slice(chunks[0].length)
            return processChunks(remainingKeys, newSize)
          }

          return processChunks(keys, newSize)
        }
          console.error(`Error fetching projects: ${error.message}`)
          const remainingKeys = keys.slice(chunks[0].length)
          return processChunks(remainingKeys, size)

      }
    }

    return await processChunks(allKeys, optimalChunkSize)
  }

  async getUserByEmail (email) {
    this._requireReady()
    if (!email) {
      throw new Error('Email is required')
    }
    try {
      return await this.call('users:get-by', { email })
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`)
    }
  }

  async setProjectDomains (projectId, domains) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this.call('projects:update-domains', { projectId, domains })
    } catch (error) {
      throw new Error(`Failed to set project domains: ${error.message}`)
    }
  }

  async checkProjectKeyAvailability (key) {
    this._requireReady()
    try {
      return await this.call('projects:check-key', { key })
    } catch (error) {
      throw new Error(
        `Failed to check project key availability: ${error.message}`
      )
    }
  }

  async removeProject (projectId) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this.call('projects:remove', { projectId })
    } catch (error) {
      throw new Error(`Failed to remove project: ${error.message}`)
    }
  }

  async getAvailableLibraries (params) {
    this._requireReady()
    const defaultParams = {
      page: 1,
      limit: 20,
      search: '',
      framework: '',
      language: ''
    }
    try {
      return await this.call('projects:get-available-libraries', {
        ...defaultParams,
        ...params
      })
    } catch (error) {
      throw new Error(`Failed to get available libraries: ${error.message}`)
    }
  }

  async addProjectLibraries (projectId, libraryIds) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this.call('projects:add-libraries', {
        projectId,
        libraryIds
      })
    } catch (error) {
      throw new Error(`Failed to add project libraries: ${error.message}`)
    }
  }

  async removeProjectLibraries (projectId, libraryIds) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this.call('projects:remove-libraries', {
        projectId,
        libraryIds
      })
    } catch (error) {
      throw new Error(`Failed to remove project libraries: ${error.message}`)
    }
  }

  async getProjectLibraries (projectId) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this.call('projects:get-libraries', { projectId })
    } catch (error) {
      throw new Error(`Failed to get project libraries: ${error.message}`)
    }
  }

  subscribe (collection, query, callback, options = {}) {
    this._requireReady()
    const subscriptionKey = JSON.stringify({ collection, query })

    if (this._subscriptions.has(subscriptionKey)) {
      return this._subscriptions.get(subscriptionKey)
    }

    try {
      const unsubscribe = this._client
        .query(collection, query, {
          ...options,
          context: this._context
        })
        .subscribe(callback)

      this._subscriptions.set(subscriptionKey, unsubscribe)

      return () => {
        unsubscribe()
        this._subscriptions.delete(subscriptionKey)
      }
    } catch (error) {
      throw new Error(`Subscription failed: ${error.message}`)
    }
  }

  subscribeChannel (name, params, callback) {
    this._requireReady()
    try {
      return this._client.channel(name, params).subscribe(callback)
    } catch (error) {
      throw new Error(`Channel subscription failed: ${error.message}`)
    }
  }

  publishToChannel (name, params, data) {
    this._requireReady()
    try {
      return this._client.channel(name, params).publish(data)
    } catch (error) {
      throw new Error(`Channel publish failed: ${error.message}`)
    }
  }

  async call (functionName, params = {}) {
    this._requireReady()
    try {
      return await this._client.call(functionName, params)
    } catch (error) {
      throw new Error(`Function call failed: ${error.message}`)
    }
  }

  async updateSchema (schema) {
    this._requireReady()
    try {
      return await this._client.call('db:update-schema', schema)
    } catch (error) {
      throw new Error(`Schema update failed: ${error.message}`)
    }
  }

  async createProject (projectData) {
    this._requireReady()

    try {
      return await this.call('projects:create', projectData)
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`)
    }
  }

  async getProject (projectId) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      return await this._client
          .query("db", buildGetProjectDataQuery(projectId))
          .get()
    } catch (error) {
      throw new Error(`Failed to get project: ${error.message}`)
    }
  }

  async getProjectByKey (key) {
    this._requireReady()
    try {
      return await this._client
          .query("db", buildGetProjectByKeyDataQuery(key))
          .get()
    } catch (error) {
      throw new Error(`Failed to get project by key: ${error.message}`)
    }
  }

  // DEPRECATED
  async fetchProject (projectId) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    return await this.query('db', buildProjectQuery(projectId))
  }

  async chooseProject ({
    username = this._context.user?.username,
    projectId,
    activeProject
  }) {
    this._requireReady()
    try {
      await this.call('fetchProject', {
        username,
        projectId,
        activeProject
      })
      await this._client.call('setCookie', 'activeProject', activeProject)
    } catch (error) {
      throw new Error(`Failed to choose project: ${error.message}`)
    }
  }

  destroy () {
    for (const unsubscribe of this._subscriptions.values()) {
      unsubscribe()
    }
    this._subscriptions.clear()
    this._client = null
    this._setReady(false)
  }

  // New helper methods for state management
  async updateState (changes) {
    if (!changes || Object.keys(changes).length === 0) {
      return
    }

    try {
      await this._client.call('state:update', changes)
    } catch (error) {
      throw new Error(`Failed to update state: ${error.message}`)
    }
  }

  async getState () {
    try {
      return await this._client.call('state:get')
    } catch (error) {
      throw new Error(`Failed to get state: ${error.message}`)
    }
  }

  /**
   * Upload a file to the database
   * @param {File} file - The file to upload
   * @param {Object} options - The options for the upload
   * @returns {Promise<string>} The source of the uploaded file
   * @example
   * const fileInput = document.querySelector('input[type="file"]')
   * const file = fileInput.files[0]
   * const { id, src } = await basedService.uploadFile(file)
   */
  async uploadFile (file, options = {}) {
    this._requireReady()
    if (!file) {
      throw new Error('File is required for upload')
    }
    try {
      const { id, src } = await this._client.stream('db:file-upload', {
        contents: file,
        ...options
      })
      return { id, src }
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`)
    }
  }

  async checkout ({
    projectId,
    pkg = 2,
    seats = 1,
    interval = 'monthly',
    plan = 'startup',
    successUrl = `${window.location.origin}/success`,
    cancelUrl = `${window.location.origin}/pricing`
  }) {
    this._requireReady()

    const prices = {
      999: { startup: 'unlimited_startup', agency: 'unlimited_agency' },
      2: { monthly: 'starter_monthly', yearly: 'starter_yearly' },
      3: { monthly: 'growth_monthly', yearly: 'growth_yearly' }
    }

    if (!projectId) {
      throw new Error('Project ID is required for checkout')
    }

    if (!prices[pkg]) {
      throw new Error(`Invalid package type: ${pkg}`)
    }

    try {
      const price = prices[pkg][interval] || prices[pkg][plan]
      if (!price) {
        throw new Error(`Invalid interval/plan combination for package ${pkg}`)
      }

      return await this.call('checkout', {
        price,
        seats,
        projectId,
        successUrl,
        cancelUrl
      })
    } catch (error) {
      throw new Error(`Failed to checkout: ${error.message}`)
    }
  }

  async updateProject (projectId, data) {
    this._requireReady()
    try {
      return await this.call('projects:update', { projectId, data })
    } catch (error) {
      throw new Error(`Failed to update project: ${error.message}`)
    }
  }

  async updateProjectComponents (projectId, components) {
    this._requireReady()
    try {
      return await this.call('projects:update-components', {
        projectId,
        components
      })
    } catch (error) {
      throw new Error(`Failed to update project components: ${error.message}`)
    }
  }

  async updateProjectSettings (projectId, settings) {
    this._requireReady()
    try {
      return await this.call('projects:update-settings', {
        projectId,
        settings
      })
    } catch (error) {
      throw new Error(`Failed to update project settings: ${error.message}`)
    }
  }

  async updateProjectName (projectId, name) {
    this._requireReady()
    try {
      return await this.call('projects:update', { projectId, name })
    } catch (error) {
      throw new Error(`Failed to update project name: ${error.message}`)
    }
  }

  async updateProjectPackage (projectId, pkg) {
    this._requireReady()
    try {
      return await this.call('projects:update', {
        projectId,
        data: { package: pkg }
      })
    } catch (error) {
      throw new Error(`Failed to update project package: ${error.message}`)
    }
  }

  /**
   * Update the icon of a project
   * @param {string} projectId - The ID of the project to update
   * @param {id, src} icon - The icon to update the project with
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectIcon (projectId, icon) {
    this._requireReady()
    try {
      return await this.call('projects:update', {
        projectId,
        data: {
          icon: {
            $id: icon.id,
            src: icon.src
          }
        }
      })
    } catch (error) {
      throw new Error(`Failed to update project icon: ${error.message}`)
    }
  }

  async createDnsRecord (domain) {
    this._requireReady()
    try {
      return await this.call('dns:create-record', { domain })
    } catch (error) {
      throw new Error(`Failed to create DNS record: ${error.message}`)
    }
  }

  async getDnsRecord (domain) {
    this._requireReady()
    try {
      return await this.call('dns:get-record', { domain })
    } catch (error) {
      throw new Error(`Failed to get DNS records: ${error.message}`)
    }
  }

  async removeDnsRecord (domain) {
    this._requireReady()
    try {
      return await this.call('dns:remove-record', { domain })
    } catch (error) {
      throw new Error(`Failed to delete DNS record: ${error.message}`)
    }
  }

  async createStorageBucket (key) {
    this._requireReady()
    try {
      const randomString = Math.random().toString(36).slice(2, 15)
      const bucket = `symbols-bucket-${key}-${randomString}`
      return await this.call('storage:create-bucket', {
        bucketName: bucket,
        clientName: key.split('.')[0]
      })
    } catch (error) {
      throw new Error(`Failed to create storage bucket: ${error.message}`)
    }
  }

  async getStorageBucket (bucketName) {
    this._requireReady()
    try {
      return await this.call('storage:get-bucket', { bucketName })
    } catch (error) {
      throw new Error(`Failed to get storage bucket: ${error.message}`)
    }
  }

  async removeStorageBucket (bucketName) {
    this._requireReady()
    try {
      return await this.call('storage:remove-bucket', { bucketName })
    } catch (error) {
      throw new Error(`Failed to remove storage bucket: ${error.message}`)
    }
  }

  /**
   * Request a password change
   * @returns {Promise<boolean>} True if the request was successful, false otherwise
   */
  async requestPasswordChange () {
    this._requireReady()
    try {
      return await this.call('users:request-password-change', {})
    } catch (error) {
      throw new Error(`Failed to request password change: ${error.message}`)
    }
  }

  /**
   * Confirm a password change
   * @param {string} verificationCode - The verification code
   * @param {string} newPassword - The new password
   * @param {string} confirmPassword - The confirmation password
   * @returns {Promise<boolean>} True if the password was changed, false otherwise
   */
  async confirmPasswordChange (verificationCode, newPassword, confirmPassword) {
    try {
      return await this.call('users:confirm-password-change', {
        verificationCode,
        newPassword,
        confirmPassword
      })
    } catch (error) {
      throw new Error(`Failed to confirm password change: ${error.message}`)
    }
  }

  async updateUserProfile (profileData) {
    this._requireReady()
    try {
      return await this.call('users:update-profile', profileData)
    } catch (error) {
      throw new Error(`Failed to update user profile: ${error.message}`)
    }
  }

  /**
   * Duplicate a project
   * @param {string} projectId - The ID of the project to duplicate
   * @param {string} newName - The new name of the project (optional)
   * @param {string} newKey - The new key of the project (optional)
   * @returns {Promise<Object>} The duplicated project
   */
  async duplicateProject (projectId, newName, newKey, targetUserId) {
    this._requireReady()
    try {
      return await this.call('projects:duplicate', {
        projectId,
        newName,
        newKey,
        targetUserId
      })
    } catch (error) {
      throw new Error(`Failed to duplicate project: ${error.message}`)
    }
  }

  /**
   * List available subscription plans
   * @param {Object} options - Options for filtering plans
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.limit - Number of plans per page (default: 20)
   * @param {string} options.status - Filter plans by status (admin only)
   * @param {boolean} options.includeSubscriptionCounts - Include subscription counts (admin only)
   * @param {string} options.sortBy - Field to sort by (default: 'displayOrder')
   * @param {string} options.sortOrder - Sort order ('asc' or 'desc', default: 'asc')
   * @returns {Promise<Object>} List of plans with pagination info
   */
  async listPlans(options = {}) {
    this._requireReady();
    try {
      return await this.call('plans:list', options);
    } catch (error) {
      throw new Error(`Failed to list plans: ${error.message}`);
    }
  }

  /**
   * Subscribe to a plan
   * @param {string} planId - ID of the plan to subscribe to
   * @param {Object} options - Options for the subscription
   * @param {string} options.paymentMethod - Payment method
   * @param {Object} options.billingAddress - Billing address
   * @param {string} options.stripeCustomerId - Stripe customer ID
   * @param {string} options.stripeSubscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Subscription details
   */
  async subscribeToPlan(planId, options = {}) {
    this._requireReady()
    try {
      return await this.call('subscriptions:create', { planId, ...options })
    } catch (error) {
      throw new Error(`Failed to subscribe to plan: ${error.message}`);
    }
  }

  /**
   * Get details of user's current subscription
   * @param {string} subscriptionId - ID of the subscription to get details for
   * @returns {Promise<Object>} Subscription details
   */
  async getSubscriptionDetails(subscriptionId) {
    this._requireReady();
    try {
      return await this.call('subscriptions:details', {
        subscriptionId
      });
    } catch (error) {
      throw new Error(`Failed to get subscription details: ${error.message}`);
    }
  }

  /**
   * Check if the current subscription is active
   * @param {string} subscriptionId - ID of the subscription to check
   * @returns {Promise<Object>} Subscription status info
   */
  async checkSubscriptionStatus(subscriptionId) {
    this._requireReady();
    try {
      return await this.call('subscriptions:check-status', {
        subscriptionId
      });
    } catch (error) {
      throw new Error(`Failed to check subscription status: ${error.message}`);
    }
  }

  /**
   * Upgrade the current subscription to a new plan
   * @param {string} planId - ID of the plan to upgrade to
   * @param {string} stripeSubscriptionId - ID of the Stripe subscription to upgrade
   * @returns {Promise<Object>} Updated subscription details
   */
  async upgradeSubscription(planId, stripeSubscriptionId) {
    this._requireReady();
    try {
      return await this.call('subscriptions:upgrade', {
        planId,
        stripeSubscriptionId
      });
    } catch (error) {
      throw new Error(`Failed to upgrade subscription: ${error.message}`);
    }
  }

  /**
   * Downgrade the current subscription to a new plan
   * @param {string} planId - ID of the plan to downgrade to
   * @param {boolean} applyImmediately - Whether to apply the downgrade immediately
   * @param {string} stripeSubscriptionId - ID of the Stripe subscription to downgrade
   * @returns {Promise<Object>} Updated subscription details
   */
  async downgradeSubscription(planId, stripeSubscriptionId, applyImmediately = false) {
    this._requireReady();
    try {
      return await this.call('subscriptions:downgrade', {
        planId,
        applyImmediately,
        stripeSubscriptionId
      });
    } catch (error) {
      throw new Error(`Failed to downgrade subscription: ${error.message}`);
    }
  }

  /**
   * Cancel the current subscription
   * @param {boolean} cancelImmediately - Whether to cancel immediately or at period end
   * @param {string} reason - Reason for cancellation
   * @returns {Promise<Object>} Result of cancellation
   */
  async cancelSubscription(cancelImmediately = false, reason = '') {
    this._requireReady();
    try {
      return await this.call('subscriptions:cancel', {
        cancelImmediately,
        reason
      });
    } catch (error) {
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Reactivate a subscription that was scheduled for cancellation
   * @returns {Promise<Object>} Updated subscription details
   */
  async reactivateSubscription(stripeSubscriptionId) {
    this._requireReady();
    try {
      return await this.call('subscriptions:reactivate', {
        stripeSubscriptionId
      });
    } catch (error) {
      throw new Error(`Failed to reactivate subscription: ${error.message}`);
    }
  }

  /**
   * Generate an invoice for the current subscription
   * @param {string} subscriptionId - ID of the subscription to generate the invoice for
   * @param {boolean} forceGenerate - Whether to force the generation of the invoice
   * @param {Array} customItems - Custom items to add to the invoice
   * @returns {Promise<Object>} Generated invoice
   */
  async generateInvoice(subscriptionId, forceGenerate = false, customItems = []) {
    this._requireReady();
    try {
      return await this.call('billing:generate-invoice', {
        subscriptionId,
        forceGenerate,
        customItems
      });
    } catch (error) {
      throw new Error(`Failed to generate invoice: ${error.message}`);
    }
  }

  /**
   * Get usage report for the current subscription
   * @param {string} subscriptionId - ID of the subscription to get the usage report for
   * @param {boolean} forceRefresh - Whether to force the refresh of the usage report
   * @returns {Promise<Object>} Usage report
   */
  async getUsageReport(subscriptionId, forceRefresh = false) {
    this._requireReady();
    try {
      return await this.call('subscriptions:get-usage-report', {
        subscriptionId,
        forceRefresh
      });
    } catch (error) {
      throw new Error(`Failed to get usage report: ${error.message}`);
    }
  }

  /**
   * Invite a user to be an account owner for the current subscription
   * @param {string} email - Email of the user to invite
   * @param {string} name - Name of the user to invite
   * @param {string} callbackUrl - URL to redirect the user to after accepting the invitation
   * @returns {Promise<Object>} Result of invitation
   */
  async inviteAccountOwner(email, name, callbackUrl) {
    this._requireReady();
    try {
      return await this.call('subscriptions:invite', {
        email,
        name,
        callbackUrl
      });
    } catch (error) {
      throw new Error(`Failed to invite account owner: ${error.message}`);
    }
  }

  /**
   * Accept an invitation to become an account owner
   * @param {string} token - Invitation token
   * @returns {Promise<Object>} Result of accepting invitation
   */
  async acceptOwnerInvitation(token) {
    this._requireReady();
    try {
      return await this.call('subscriptions:accept-owner-invitation', {
        token
      });
    } catch (error) {
      throw new Error(`Failed to accept owner invitation: ${error.message}`);
    }
  }

  /**
   * Remove an account owner from the current subscription
   * @param {string} userId - ID of the user to remove
   * @returns {Promise<Object>} Result of removal
   */
  async removeAccountOwner(userId) {
    this._requireReady();
    try {
      return await this.call('subscriptions:remove-account-owner', {
        targetUserId: userId
      });
    } catch (error) {
      throw new Error(`Failed to remove account owner: ${error.message}`);
    }
  }

  /**
   * Check if a resource limit has been reached
   * @param {string} resourceType - Type of resource to check
   * @param {string} projectId - ID of the project to check the resource limit for
   * @param {number} quantity - Amount being requested
   * @param {string} userId - ID of user to check (admin only, defaults to current user)
   * @returns {Promise<Object>} Result of check
   */
  async checkResourceLimit(resourceType, projectId, quantity = 1, userId = '') {
    this._requireReady();
    try {
      return await this.call('subscriptions:check-resource-limit', {
        resourceType,
        projectId,
        quantity,
        userId
      });
    } catch (error) {
      throw new Error(`Failed to check resource limit: ${error.message}`);
    }
  }

  /**
   * Check if a user has access to a feature
   * @param {string} featureKey - Key of the feature to check
   * @param {string} userId - ID of user to check (admin only, defaults to current user)
   * @returns {Promise<Object>} Access check result
   */
  async checkFeatureAccess(featureKey, userId) {
    this._requireReady();
    try {
      return await this.call('features:check-access', {
        featureKey,
        userId
      });
    } catch (error) {
      throw new Error(`Failed to check feature access: ${error.message}`);
    }
  }

  /**
   * Get all features available to the current user
   * @returns {Promise<Object>} Available features
   */
  async getUserFeatures() {
    this._requireReady();
    try {
      return await this.call('subscriptions:get-user-features', {});
    } catch (error) {
      throw new Error(`Failed to get user features: ${error.message}`);
    }
  }

  /**
   * Get all available features across all plans
   * @param {string} subscriptionId - ID of the subscription to get the available features for
   * @param {string} userId - ID of user to get the available features for (admin only, defaults to current user)
   * @param {boolean} includeDetails - Whether to include details about the features
   * @returns {Promise<Object>} Available features
   */
  async getAvailableFeatures(subscriptionId, userId = '', includeDetails = false) {
    this._requireReady();
    try {
      return await this.call('features:get-available', {
        subscriptionId,
        userId,
        includeDetails
      });
    } catch (error) {
      throw new Error(`Failed to get available features: ${error.message}`);
    }
  }

  /**
   * List all feature flags (admin only)
   * @param {Object} options - Options for listing feature flags
   * @param {number} options.page - Page number
   * @param {number} options.limit - Number of items per page
   * @param {string} options.status - Filter by status
   * @returns {Promise<Object>} List of feature flags
   */
  async listFeatureFlags(options = {}) {
    this._requireReady();
    try {
      return await this.call('features:list', options);
    } catch (error) {
      throw new Error(`Failed to list feature flags: ${error.message}`);
    }
  }

  /**
   * Update a feature flag (admin only)
   * @param {string} flagId - ID of the feature flag to update
   * @param {Object} options - Update data
   * @param {string} options.key - Key of the feature flag
   * @param {string} options.name - Name of the feature flag
   * @param {string} options.description - Description of the feature flag
   * @param {string} options.defaultValue - Default value of the feature flag
   * @param {Object} options.planOverrides - Plan overrides for the feature flag
   * @param {Object} options.userOverrides - User overrides for the feature flag
   * @param {string} options.status - Status of the feature flag
   * @returns {Promise<Object>} Updated feature flag
   */
  async updateFeatureFlag(flagId, options) {
    this._requireReady();
    try {
      return await this.call('features:update', {
        flagId,
        ...options
      });
    } catch (error) {
      throw new Error(`Failed to update feature flag: ${error.message}`);
    }
  }

  /**
   * Remove a feature flag (admin only)
   * @param {string} flagId - ID of the feature flag to remove
   * @returns {Promise<Object>} Result of removal
   */
  async removeFeatureFlag(flagId) {
    this._requireReady();
    try {
      return await this.call('features:remove', {
        flagId
      });
    } catch (error) {
      throw new Error(`Failed to remove feature flag: ${error.message}`);
    }
  }

  /**
   * Batch update feature flags (admin only)
   * @param {Array} operations - Array of feature flag operations
   * @param {string} operations.flagId - ID of the feature flag to update
   * @param {string} operations.key - Key of the feature flag
   * @param {string} operations.name - Name of the feature flag
   * @param {string} operations.description - Description of the feature flag
   * @param {boolean} operations.defaultValue - Default value of the feature flag
   * @param {Object} operations.planOverrides - Plan overrides for the feature flag
   * @param {Object} operations.userOverrides - User overrides for the feature flag
   * @param {string} operations.status - Status of the feature flag
   * @returns {Promise<Object>} Result of batch update
   */
  async batchUpdateFeatureFlags(operations) {
    this._requireReady();
    try {
      return await this.call('features:batch-update', {
        operations
      });
    } catch (error) {
      throw new Error(`Failed to batch update feature flags: ${error.message}`);
    }
  }

  /**
   * Update plan details (admin only)
   * @param {string} planId - ID of the plan to update
   * @param {Object} data - Update data
   * @param {string} data.name - Display name (e.g., "Pro", "Team")
   * @param {string} data.description - Marketing description
   * @param {number} data.price - Monthly price in cents
   * @param {number} data.annualPrice - Annual price in cents (discounted)
   * @param {number} data.lifetimePrice - One-time lifetime price in cents
   * @param {string} data.billingType - Payment type
   * @param {string} data.status - Status
   * @param {Object} data.features - Detailed feature configuration
   * @returns {Promise<Object>} Updated plan
   */
  async updatePlanDetails(planId, data) {
    this._requireReady();
    try {
      return await this.call('plans:update-details', {
        planId,
        data
      });
    } catch (error) {
      throw new Error(`Failed to update plan details: ${error.message}`);
    }
  }

  /**
   * Update plan status (admin only)
   * @param {string} planId - ID of the plan to update
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated plan
   */
  async updatePlanStatus(planId, status) {
    this._requireReady();
    try {
      return await this.call('plans:update-status', {
        planId,
        status
      });
    } catch (error) {
      throw new Error(`Failed to update plan status: ${error.message}`);
    }
  }
}
