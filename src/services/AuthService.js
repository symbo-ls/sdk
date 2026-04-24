import { BaseService } from './BaseService.js'
import {
  ROLE_PERMISSIONS,
  TIER_FEATURES,
  PROJECT_ROLE_PERMISSIONS
} from '../utils/permission.js'
import { logger } from '../utils/logger.js'

const PLUGIN_SESSION_STORAGE_KEY = 'plugin_auth_session'

export class AuthService extends BaseService {
  constructor(config) {
    super(config)
    this._userRoles = new Set(['guest', 'editor', 'admin', 'owner'])
    this._projectTiers = new Set([
      'ready',
      'starter',
      'pro1',
      'pro2',
      'enterprise'
    ])
    this._projectRoleCache = new Map() // Cache for project roles
    this._roleCacheExpiry = 5 * 60 * 1000 // 5 minutes cache expiry
    this._pluginSession = null

    this._resolvePluginSession(
      config?.session ||
        config?.pluginSession ||
        config?.options?.pluginSession ||
        config?.context?.pluginSession ||
        null
    )
  }

  // Use BaseService.init/_request/_requireReady implementations

  // ==================== AUTH METHODS ====================

  async register(userData, options = {}) {
    try {
      const { payload, session } = this._preparePluginPayload(
        { ...(userData || {}) },
        options.session
      )

      const response = await this._request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
        methodName: 'register'
      })
      if (response.success) {
        if (session) {
          this._clearPluginSession(session)
        }

        // Register username.symbo.ls DNS records
        const username = response.data?.user?.username
        if (username) {
          this._createSubdomainRecords(username).catch(err => {
            logger.warn('Failed to create DNS records for user:', err?.message || err)
          })
        }

        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`, { cause: error })
    }
  }

  async login(email, password, options = {}) {
    try {
      const { payload, session } = this._preparePluginPayload(
        {
          email,
          password
        },
        options.session
      )

      const response = await this._request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
        methodName: 'login'
      })

      // Handle new response format: response.data.tokens
      if (response.success && response.data && response.data.tokens) {
        const { tokens } = response.data
        const tokenData = {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.accessTokenExp?.expiresIn,
          token_type: 'Bearer'
        }

        // Set tokens in TokenManager (will handle persistence and refresh scheduling)
        if (this._tokenManager) {
          this._tokenManager.setTokens(tokenData)
        }
      }

      if (response.success) {
        if (session) {
          this._clearPluginSession(session)
        }
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`, { cause: error })
    }
  }

  async logout() {
    this._requireReady('logout')
    try {
      // Call the logout API endpoint
      await this._request('/auth/logout', {
        method: 'POST',
        methodName: 'logout'
      })

      // Clear tokens from TokenManager and context
      if (this._tokenManager) {
        this._tokenManager.clearTokens()
      }
    } catch (error) {
      // Even if the API call fails, clear local tokens
      if (this._tokenManager) {
        this._tokenManager.clearTokens()
      }

      throw new Error(`Logout failed: ${error.message}`, { cause: error })
    }
  }

  async refreshToken(refreshToken) {
    try {
      const response = await this._request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        methodName: 'refreshToken'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`, { cause: error })
    }
  }

  async googleAuth(idToken, inviteToken = null, options = {}) {
    try {
      const { payload, session } = this._preparePluginPayload({ idToken }, options.session)
      if (inviteToken) {
        payload.inviteToken = inviteToken
      }

      const response = await this._request('/auth/google', {
        method: 'POST',
        body: JSON.stringify(payload),
        methodName: 'googleAuth'
      })

      // Handle new response format: response.data.tokens
      if (response.success && response.data && response.data.tokens) {
        const { tokens } = response.data
        const tokenData = {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.accessTokenExp?.expiresIn,
          token_type: 'Bearer'
        }

        // Set tokens in TokenManager
        if (this._tokenManager) {
          this._tokenManager.setTokens(tokenData)
        }
      }

      if (response.success) {
        if (session) {
          this._clearPluginSession(session)
        }
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Google auth failed: ${error.message}`, { cause: error })
    }
  }

  async githubAuth(code, inviteToken = null, options = {}) {
    try {
      const { payload, session } = this._preparePluginPayload({ code }, options.session)
      if (inviteToken) {
        payload.inviteToken = inviteToken
      }

      const response = await this._request('/auth/github', {
        method: 'POST',
        body: JSON.stringify(payload),
        methodName: 'githubAuth'
      })

      // Handle new response format: response.data.tokens
      if (response.success && response.data && response.data.tokens) {
        const { tokens } = response.data
        const tokenData = {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.accessTokenExp?.expiresIn,
          token_type: 'Bearer'
        }

        // Set tokens in TokenManager
        if (this._tokenManager) {
          this._tokenManager.setTokens(tokenData)
        }
      }

      if (response.success) {
        if (session) {
          this._clearPluginSession(session)
        }
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`GitHub auth failed: ${error.message}`, { cause: error })
    }
  }

  async googleAuthCallback (code, redirectUri, inviteToken = null, options = {}) {
    try {
      const { payload: body, session } = this._preparePluginPayload(
        { code, redirectUri },
        options.session
      )
      if (inviteToken) {
        body.inviteToken = inviteToken
      }

      const response = await this._request('/auth/google/callback', {
        method: 'POST',
        body: JSON.stringify(body),
        methodName: 'googleAuthCallback'
      })

      // Handle new response format: response.data.tokens
      if (response.success && response.data && response.data.tokens) {
        const { tokens } = response.data
        const tokenData = {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.accessTokenExp?.expiresIn,
          token_type: 'Bearer'
        }

        // Set tokens in TokenManager
        if (this._tokenManager) {
          this._tokenManager.setTokens(tokenData)
        }
      }

      if (response.success) {
        if (session) {
          this._clearPluginSession(session)
        }
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Google auth callback failed: ${error.message}`, { cause: error })
    }
  }

  async requestPasswordReset(email) {
    try {
      const response = await this._request('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
        methodName: 'requestPasswordReset'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Password reset request failed: ${error.message}`, { cause: error })
    }
  }

  async confirmPasswordReset(token, password) {
    try {
      const response = await this._request('/auth/reset-password-confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        methodName: 'confirmPasswordReset'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Password reset confirmation failed: ${error.message}`, { cause: error })
    }
  }

  async confirmRegistration(token) {
    try {
      const response = await this._request('/auth/register-confirmation', {
        method: 'POST',
        body: JSON.stringify({ token }),
        methodName: 'confirmRegistration'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Registration confirmation failed: ${error.message}`, { cause: error })
    }
  }

  async requestPasswordChange() {
    this._requireReady('requestPasswordChange')
    try {
      const response = await this._request('/auth/request-password-change', {
        method: 'POST',
        methodName: 'requestPasswordChange'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Password change request failed: ${error.message}`, { cause: error })
    }
  }

  async confirmPasswordChange(currentPassword, newPassword, code) {
    this._requireReady('confirmPasswordChange')
    try {
      const response = await this._request('/auth/confirm-password-change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, code }),
        methodName: 'confirmPasswordChange'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Password change confirmation failed: ${error.message}`, { cause: error })
    }
  }

  async getMe(options = {}) {
    this._requireReady('getMe')
    try {
      const session = this._resolvePluginSession(options.session)
      // Literals inlined at each _request call site so the drift analyzer
      // can match them against the server route (it can't see through a
      // variable-typed `endpoint`).
      const response = session
        ? await this._request(`/auth/me?session=${encodeURIComponent(session)}`, {
          method: 'GET',
          methodName: 'getMe'
        })
        : await this._request('/auth/me', {
          method: 'GET',
          methodName: 'getMe'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`, { cause: error })
    }
  }

  getAuthToken() {
    if (!this._tokenManager) {
      return null
    }
    return this._tokenManager.getAccessToken()
  }

  /**
   * Get stored authentication state (backward compatibility method)
   * Replaces AuthService.getStoredAuthState()
   */
  async getStoredAuthState() {
    try {
      if (!this._tokenManager) {
        return {
          userId: false,
          authToken: false
        }
      }

      const tokenStatus = this._tokenManager.getTokenStatus()

      if (!tokenStatus.hasTokens) {
        return {
          userId: false,
          authToken: false
        }
      }

      // If tokens exist but are invalid, try to refresh
      if (!tokenStatus.isValid && tokenStatus.hasRefreshToken) {
        try {
          await this._tokenManager.ensureValidToken()
        } catch (error) {
          logger.warn('[AuthService] Token refresh failed:', error.message)
          // Only clear tokens if it's definitely an auth error, not a network error
          if (
            error.message.includes('401') ||
            error.message.includes('403') ||
            error.message.includes('invalid') ||
            error.message.includes('expired')
          ) {
            this._tokenManager.clearTokens()
            return {
              userId: false,
              authToken: false,
              error: `Authentication failed: ${error.message}`
            }
          }
          // For network errors, keep tokens and return what we have
          return {
            userId: false,
            authToken: this._tokenManager.getAccessToken(),
            error: `Network error during token refresh: ${error.message}`,
            hasTokens: true
          }
        }
      }

      // Check if we have a valid token now
      const currentAccessToken = this._tokenManager.getAccessToken()
      if (!currentAccessToken) {
        return {
          userId: false,
          authToken: false
        }
      }

      // Get current user data if we have valid tokens
      // Be more lenient with API failures - don't immediately clear tokens
      try {
        const currentUser = await this.getMe()

        return {
          userId: currentUser.user.id,
          authToken: currentAccessToken,
          ...currentUser,
          error: null
        }
      } catch (error) {
        logger.warn('[AuthService] Failed to get user data:', error.message)

        // Only clear tokens if it's an auth error (401, 403), not network errors
        if (error.message.includes('401') || error.message.includes('403')) {
          this._tokenManager.clearTokens()
          return {
            userId: false,
            authToken: false,
            error: `Authentication failed: ${error.message}`
          }
        }

        // For other errors (network, 500, etc.), keep tokens but return minimal state
        return {
          userId: false,
          authToken: currentAccessToken,
          error: `Failed to get user data: ${error.message}`,
          hasTokens: true
        }
      }
    } catch (error) {
      logger.error(
        '[AuthService] Unexpected error in getStoredAuthState:',
        error
      )
      return {
        userId: false,
        authToken: false,
        error: `Failed to get stored auth state: ${error.message}`
      }
    }
  }

  // ==================== USER METHODS ====================

  async getUserProfile() {
    this._requireReady('getUserProfile')
    try {
      const response = await this._request('/users/profile', {
        method: 'GET',
        methodName: 'getUserProfile'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`, { cause: error })
    }
  }

  async updateUserProfile(profileData) {
    this._requireReady('updateUserProfile')
    try {
      const response = await this._request('/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileData),
        methodName: 'updateUserProfile'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update user profile: ${error.message}`, { cause: error })
    }
  }

  async getUserProjects() {
    this._requireReady('getUserProjects')
    try {
      const response = await this._request('/users/projects', {
        method: 'GET',
        methodName: 'getUserProjects'
      })
      if (response.success) {
        return response.data.map((project) => ({
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
      throw new Error(`Failed to get user projects: ${error.message}`, { cause: error })
    }
  }

  async getUser(userId) {
    this._requireReady('getUser')
    if (!userId) {
      throw new Error('User ID is required')
    }
    try {
      const response = await this._request(`/users/${userId}`, {
        method: 'GET',
        methodName: 'getUser'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`, { cause: error })
    }
  }

  async getUserByEmail(email) {
    this._requireReady('getUserByEmail')
    if (!email) {
      throw new Error('Email is required')
    }
    try {
      const response = await this._request(`/auth/user?email=${email}`, {
        method: 'GET',
        methodName: 'getUserByEmail'
      })
      if (response.success) {
        return response.data.user
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user by email: ${error.message}`, { cause: error })
    }
  }

  // ==================== PROJECT ROLE METHODS ====================

  /**
   * Get the current user's role for a specific project by project ID
   * Uses caching to avoid repeated API calls
   */
  async getMyProjectRole(projectId) {
    this._requireReady('getMyProjectRole')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    // If there are no valid tokens, treat user as guest for public access
    if (!this.hasValidTokens()) {
      return 'guest'
    }

    // Check cache first
    const cacheKey = `role_${projectId}`
    const cached = this._projectRoleCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this._roleCacheExpiry) {
      return cached.role
    }

    try {
      const response = await this._request(`/projects/${projectId}/role`, {
        method: 'GET',
        methodName: 'getMyProjectRole'
      })

      if (response.success) {
        const { role } = response.data
        // Cache the result
        this._projectRoleCache.set(cacheKey, {
          role,
          timestamp: Date.now()
        })
        return role
      }
      throw new Error(response.message)
    } catch (error) {
      const message = error?.message || ''
      // If request failed due to missing/invalid auth, default to guest
      if (/401|403|unauthorized|no token|invalid token/iu.test(message)) {
        return 'guest'
      }
      throw new Error(`Failed to get project role: ${message}`, { cause: error })
    }
  }

  /**
   * Get the current user's role for a specific project by project key.
   *
   * Pass `{owner, key}` to use the collision-safe 2-seg route when the
   * owner is known. Cache is scoped by the full (owner, key) tuple so two
   * owners sharing a bare key never share a cached role entry.
   *
   * @param {string | { owner?: string, key: string }} keyOrSpec
   */
  async getMyProjectRoleByKey(keyOrSpec) {
    this._requireReady('getMyProjectRoleByKey')

    let owner = null
    let projectKey = null
    if (keyOrSpec && typeof keyOrSpec === 'object') {
      owner = keyOrSpec.owner || null
      projectKey = keyOrSpec.key
    } else {
      projectKey = keyOrSpec
    }
    if (!projectKey) throw new Error('Project key is required')

    // If there are no valid tokens, treat user as guest for public access
    if (!this.hasValidTokens()) {
      return 'guest'
    }

    // Cache is scoped by (owner, key) so bare-key collisions across owners
    // don't share a cached role entry.
    const cacheKey = owner ? `role_key_${owner}/${projectKey}` : `role_key_${projectKey}`
    const cached = this._projectRoleCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this._roleCacheExpiry) {
      return cached.role
    }

    const path = owner
      ? `${encodeURIComponent(owner)}/${encodeURIComponent(projectKey)}`
      : encodeURIComponent(projectKey)
    try {
      const response = await this._request(`/projects/key/${path}/role`, {
        method: 'GET',
        methodName: 'getMyProjectRoleByKey'
      })

      if (response.success) {
        const { role } = response.data
        // Cache the result
        this._projectRoleCache.set(cacheKey, {
          role,
          timestamp: Date.now()
        })
        return role
      }
      throw new Error(response.message)
    } catch (error) {
      const message = error?.message || ''
      // If request failed due to missing/invalid auth, default to guest
      if (/401|403|unauthorized|no token|invalid token/iu.test(message)) {
        return 'guest'
      }
      throw new Error(`Failed to get project role by key: ${message}`, { cause: error })
    }
  }

  /**
   * Clear the project role cache for a specific project or all projects
   */
  clearProjectRoleCache(projectId = null) {
    if (projectId) {
      // Clear specific project cache
      this._projectRoleCache.delete(`role_${projectId}`)
      // Also clear by key if we have it cached
      for (const [key] of this._projectRoleCache) {
        if (key.startsWith('role_key_')) {
          this._projectRoleCache.delete(key)
        }
      }
    } else {
      // Clear all cache
      this._projectRoleCache.clear()
    }
  }

  /**
   * Get project role with fallback to user projects list
   * This method tries to get the role from user projects first,
   * then falls back to API call if not found
   */
  async getProjectRoleWithFallback(projectId, userProjects = null) {
    this._requireReady('getProjectRoleWithFallback')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    // First try to find in user projects if provided
    if (userProjects && Array.isArray(userProjects)) {
      const userProject = userProjects.find(p => p.id === projectId)
      if (userProject && userProject.role) {
        return userProject.role
      }
    }

    // Fallback to API call
    return await this.getMyProjectRole(projectId)
  }

  /**
   * Get project role with fallback to user projects list (by project key)
   * This method tries to get the role from user projects first,
   * then falls back to API call if not found
   */
  async getProjectRoleByKeyWithFallback(projectKey, userProjects = null) {
    this._requireReady('getProjectRoleByKeyWithFallback')
    if (!projectKey) {
      throw new Error('Project key is required')
    }

    // First try to find in user projects if provided
    if (userProjects && Array.isArray(userProjects)) {
      const userProject = userProjects.find(p => p.key === projectKey)
      if (userProject && userProject.role) {
        return userProject.role
      }
    }

    // Fallback to API call
    return await this.getMyProjectRoleByKey(projectKey)
  }

  // ==================== AUTH HELPER METHODS ====================

  /**
   * Debug method to check token status
   */
  getTokenDebugInfo() {
    if (!this._tokenManager) {
      return {
        tokenManagerExists: false,
        error: 'TokenManager not initialized'
      }
    }

    const tokenStatus = this._tokenManager.getTokenStatus()
    const { tokens } = this._tokenManager

    return {
      tokenManagerExists: true,
      tokenStatus,
      hasAccessToken: Boolean(tokens.accessToken),
      hasRefreshToken: Boolean(tokens.refreshToken),
      accessTokenPreview: tokens.accessToken
        ? `${tokens.accessToken.substring(0, 20)}...`
        : null,
      expiresAt: tokens.expiresAt,
      timeToExpiry: tokenStatus.timeToExpiry,
      authHeader: this._tokenManager.getAuthHeader()
    }
  }

  /**
   * Helper method to check if user is authenticated
   */
  isAuthenticated() {
    if (!this._tokenManager) {
      return false
    }
    return this._tokenManager.hasTokens()
  }

  /**
   * Helper method to check if user has valid tokens
   */
  hasValidTokens() {
    if (!this._tokenManager) {
      return false
    }
    return (
      this._tokenManager.hasTokens() && this._tokenManager.isAccessTokenValid()
    )
  }

  /**
   * Helper method to get current user info
   */
  async getCurrentUser() {
    try {
      return await this.getMe()
    } catch (error) {
      throw new Error(`Failed to get current user: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to validate user data for registration
   */
  validateRegistrationData(userData) {
    const errors = []

    if (!userData.email || typeof userData.email !== 'string') {
      errors.push('Email is required and must be a string')
    } else if (!this._isValidEmail(userData.email)) {
      errors.push('Email must be a valid email address')
    }

    if (!userData.password || typeof userData.password !== 'string') {
      errors.push('Password is required and must be a string')
    } else if (userData.password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }

    if (userData.username && typeof userData.username !== 'string') {
      errors.push('Username must be a string')
    } else if (userData.username && userData.username.length < 3) {
      errors.push('Username must be at least 3 characters long')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Helper method to register with validation
   */
  async registerWithValidation(userData, options = {}) {
    const validation = this.validateRegistrationData(userData)
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
    }

    return await this.register(userData, options)
  }

  /**
   * Helper method to login with validation
   */
  async loginWithValidation(email, password, options = {}) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a string')
    }

    if (!password || typeof password !== 'string') {
      throw new Error('Password is required and must be a string')
    }

    if (!this._isValidEmail(email)) {
      throw new Error('Email must be a valid email address')
    }

    return await this.login(email, password, options)
  }

  /**
   * Private helper to validate email format
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
    return emailRegex.test(email)
  }

  // ==================== PERMISSION METHODS (Existing) ====================

  hasPermission(requiredPermission) {
    const authState = this._context?.state
    if (!authState) {
      return false
    }

    if (this.hasGlobalPermission(authState.globalRole, requiredPermission)) {
      return true
    }

    return this.checkProjectPermission(
      authState.projectRole,
      requiredPermission
    )
  }

  hasGlobalPermission(globalRole, requiredPermission) {
    return ROLE_PERMISSIONS[globalRole]?.includes(requiredPermission) || false
  }

  checkProjectPermission(projectRole, requiredPermission) {
    return (
      PROJECT_ROLE_PERMISSIONS[projectRole]?.includes(requiredPermission) ||
      false
    )
  }

  checkProjectFeature(projectTier, feature) {
    if (feature.startsWith('aiCopilot') || feature.startsWith('aiChatbot')) {
      const [featureBase] = feature.split(':')
      const tierFeature = TIER_FEATURES[projectTier]?.find((f) =>
        f.startsWith(featureBase)
      )
      if (!tierFeature) {
        return false
      }
      const [, tierTokens] = tierFeature.split(':')
      return parseInt(tierTokens, 10) || 0
    }

    return TIER_FEATURES[projectTier]?.includes(feature) || false
  }

  // Operation checking
  async canPerformOperation(projectId, operation, options = {}) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { checkFeatures = true, requireAll = true } = options

    const operationConfig = this._permissionMap[operation]
    if (!operationConfig) {
      return false
    }

    const { permissions = [], features = [] } = operationConfig

    try {
      // Check permissions
      const permissionResults = await Promise.all(
        permissions.map((permission) =>
          this.checkProjectPermission(projectId, permission)
        )
      )

      const hasPermissions = requireAll
        ? permissionResults.every(Boolean)
        : permissionResults.some(Boolean)

      if (!hasPermissions) {
        return false
      }

      // Check features if required
      if (checkFeatures && features.length > 0) {
        const featureResults = features.map((feature) => {
          const result = this.hasProjectFeature(projectId, feature)
          return feature.includes(':')
            ? typeof result === 'number' && result > 0
            : result
        })

        const hasFeatures = requireAll
          ? featureResults.every(Boolean)
          : featureResults.some(Boolean)

        if (!hasFeatures) {
          return false
        }
      }

      return true
    } catch (error) {
      this._setError(error)
      return false
    }
  }

  // Higher-level permission methods
  async withPermission(projectId, operation, action) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const canPerform = await this.canPerformOperation(projectId, operation)
    if (!canPerform) {
      throw new Error(
        `Permission denied: Cannot perform ${operation} operation`
      )
    }

    return action()
  }

  // Cleanup
  destroy() {
    if (this._tokenManager) {
      this._tokenManager.destroy()
      this._tokenManager = null
    }
    // Clear project role cache
    this._projectRoleCache.clear()
    this._setReady(false)
  }

  _preparePluginPayload(payload, sessionOverride = null) {
    const target =
      payload && typeof payload === 'object'
        ? { ...payload }
        : {}

    const session = this._resolvePluginSession(sessionOverride)

    if (session && !Object.hasOwn(target, 'session')) {
      target.session = session
      return { payload: target, session }
    }

    return { payload: target, session: null }
  }

  _resolvePluginSession(sessionOverride = null) {
    if (sessionOverride) {
      return this._cachePluginSession(sessionOverride)
    }

    if (this._pluginSession) {
      return this._pluginSession
    }

    const optionSession = this._options?.pluginSession
    if (optionSession) {
      return this._cachePluginSession(optionSession)
    }

    const contextSession = this._context?.pluginSession
    if (contextSession) {
      return this._cachePluginSession(contextSession)
    }

    if (typeof window !== 'undefined') {
      try {
        const sessionFromUrl = new URL(window.location.href).searchParams.get('session')
        if (sessionFromUrl) {
          return this._cachePluginSession(sessionFromUrl)
        }
      } catch {
        // Ignore URL parsing errors
      }

      try {
        if (window.localStorage) {
          const stored = window.localStorage.getItem(PLUGIN_SESSION_STORAGE_KEY)
          if (stored) {
            this._pluginSession = stored
            return stored
          }
        }
      } catch {
        // Ignore storage access issues
      }
    }

    return null
  }

  _cachePluginSession(session) {
    if (!session) {
      return null
    }

    this._pluginSession = session

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(PLUGIN_SESSION_STORAGE_KEY, session)
        }
      } catch {
        // Ignore storage access issues
      }
    }

    return session
  }

  setPluginSession(session) {
    this._cachePluginSession(session)
  }

  _clearPluginSession(session = null) {
    if (!session || this._pluginSession === session) {
      this._pluginSession = null
    }

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.removeItem(PLUGIN_SESSION_STORAGE_KEY)
        }
      } catch {
        // Ignore storage access issues
      }
    }
  }

  /**
   * Cross-org notification badge counts for the org-switcher dropdown.
   * NEEDED_FOR_INTRANET §I8. Fails-soft to `{counts: {}}` when the
   * governance edge-fn is unavailable.
   *
   * @returns {Promise<{counts: Record<string, {mentions?: number, ticketsAssigned?: number, meetingInvites?: number}>}>}
   */
  async getMyOrgNotifications () {
    this._requireReady('getMyOrgNotifications')
    const response = await this._request('/auth/me/org-notifications', {
      method: 'GET',
      methodName: 'getMyOrgNotifications'
    })
    if (response?.success) return response.data
    return { counts: {} }
  }

  /**
   * Cross-org calendar busy slots for the unified calendar.
   * NEEDED_FOR_INTRANET §I9. Fails-soft to `{slots: []}`.
   *
   * @param {{from: string, to: string}} window - ISO 8601 timestamps
   * @returns {Promise<{slots: Array<{workspaceId: string, orgId: string, start_at: string, end_at: string, title?: string}>}>}
   */
  async getMyFreebusy ({ from, to }) {
    this._requireReady('getMyFreebusy')
    if (!from || !to) throw new Error('from + to (ISO 8601) required')
    const qs = new URLSearchParams({ from, to }).toString()
    const response = await this._request(`/auth/me/freebusy?${qs}`, {
      method: 'GET',
      methodName: 'getMyFreebusy'
    })
    if (response?.success) return response.data
    return { slots: [] }
  }

  /**
   * List every project the authenticated user has any role on, across
   * every org they're a member of. Combines owner + collaborator
   * projects into one flat list. Server paginates by default.
   *
   * @returns {Promise<{projects: Array<object>, total?: number}>}
   */
  async getMyProjects () {
    this._requireReady('getMyProjects')
    const response = await this._request('/auth/me/projects', {
      method: 'GET',
      methodName: 'getMyProjects'
    })
    if (response?.success) return response.data
    return { projects: [] }
  }

  /**
   * List every team the authenticated user belongs to, grouped by org.
   * Mirrors the `teams[]` claim surfaced via sessionClaims — but a
   * direct fetch avoids stale free-tier claims.
   *
   * @returns {Promise<{teams: Array<{id: string, name: string, organization: string, type: string, role: string}>}>}
   */
  async getMyTeams () {
    this._requireReady('getMyTeams')
    const response = await this._request('/auth/me/teams', {
      method: 'GET',
      methodName: 'getMyTeams'
    })
    if (response?.success) return response.data
    return { teams: [] }
  }

  /**
   * List every org the authenticated user is a member of, with role +
   * ownership flags. Source for workspace-switcher UIs.
   *
   * @returns {Promise<{memberships: Array<{orgId: string, role: string, isOwner: boolean, workspaces?: Array<object>}>}>}
   */
  async getMyOrgMemberships () {
    this._requireReady('getMyOrgMemberships')
    const response = await this._request('/auth/me/org-memberships', {
      method: 'GET',
      methodName: 'getMyOrgMemberships'
    })
    if (response?.success) return response.data
    return { memberships: [] }
  }

  /**
   * Resend the email verification link for the authenticated user.
   * Requires auth (the server takes `req.user` as the resend target).
   * No-op idempotent on the client — server rate-limits resends.
   */
  async resendVerification () {
    return this._call('resendVerification', '/auth/resend-verification', { method: 'POST' })
  }

  /**
   * Confirm email verification using a token. The token is the one
   * emailed to the user — no auth required; verification completes the
   * sign-up flow for the user the token identifies.
   * @param {string} token
   */
  async verifyEmail (token) {
    if (!token) throw new Error('token is required')
    return this._call('verifyEmail', `/auth/verify-email/${encodeURIComponent(token)}`)
  }

  /**
   * Role-enrichment feed for the People page. Returns every OrgMember
   * row in `orgId` with the user's email attached, so consumers can
   * match by email (common join key in legacy views) and read the raw
   * role key (builtin or custom). Caller must be an org member.
   *
   * Replaces legacy `public.people` + `public.user_roles` view reliance
   * per NEEDED_FOR_INTRANET §90.
   *
   * @param {string} orgId
   * @returns {Promise<{members: Array<{email: string, role: string}>}>}
   */
  async getOrgMemberRoles (orgId) {
    this._requireReady('getOrgMemberRoles')
    if (!orgId) throw new Error('orgId is required')
    const response = await this._request(`/auth/org/${encodeURIComponent(orgId)}/member-roles`, {
      method: 'GET',
      methodName: 'getOrgMemberRoles'
    })
    if (response?.success) return response.data
    return { members: [] }
  }
}
