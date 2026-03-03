import { BaseService } from './BaseService.js'
import environment from '../config/environment.js'
import { getTokenManager } from '../utils/TokenManager.js'

export class CoreService extends BaseService {
  constructor (config) {
    super(config)
    this._client = null
    this._initialized = false
    this._apiUrl = null
    this._tokenManager = null
  }

  init ({ context }) {
    try {
      const { appKey, authToken } = context || this._context

      // Get base URL from environment config
      this._apiUrl = environment.apiUrl

      if (!this._apiUrl) {
        throw new Error('Core service base URL not configured')
      }

      // Initialize token manager
      this._tokenManager = getTokenManager({
        apiUrl: this._apiUrl,
        onTokenRefresh: (tokens) => {
          // Update context with new token
          this.updateContext({ authToken: tokens.accessToken })
        },
        onTokenExpired: () => {
          // Clear context token
          this.updateContext({ authToken: null })
        },
        onTokenError: (error) => {
          console.error('Token management error:', error)
        }
      })

      if (authToken && !this._tokenManager.hasTokens()) {
        this._tokenManager.setTokens({ access_token: authToken })
      }

      // Store masked configuration info
      this._info = {
        config: {
          apiUrl: this._apiUrl,
          appKey: appKey ? `${appKey.substr(0, 4)}...${appKey.substr(-4)}` : null,
          hasToken: Boolean(authToken)
        }
      }

      this._initialized = true
      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  // Helper to check if method requires initialization
  _requiresInit (methodName) {
    const noInitMethods = new Set([
      'register',
      'login',
      'googleAuth',
      'googleAuthCallback',
      'githubAuth',
      'requestPasswordReset',
      'confirmPasswordReset',
      'confirmRegistration',
      'verifyEmail',
      'listPublicProjects',
      'getPublicProject',
      'getHealthStatus'
    ])
    return !noInitMethods.has(methodName)
  }

  // Override _requireReady to be more flexible
  _requireReady (methodName) {
    if (this._requiresInit(methodName) && !this._initialized) {
      throw new Error('Core service not initialized')
    }
  }

  // Debug method to check token status
  getTokenDebugInfo () {
    if (!this._tokenManager) {
      return {
        tokenManagerExists: false,
        error: 'TokenManager not initialized'
      }
    }

    const tokenStatus = this._tokenManager.getTokenStatus()
    const {tokens} = this._tokenManager

    return {
      tokenManagerExists: true,
      tokenStatus,
      hasAccessToken: Boolean(tokens.accessToken),
      hasRefreshToken: Boolean(tokens.refreshToken),
      accessTokenPreview: tokens.accessToken ? `${tokens.accessToken.substring(0, 20)}...` : null,
      expiresAt: tokens.expiresAt,
      timeToExpiry: tokenStatus.timeToExpiry,
      authHeader: this._tokenManager.getAuthHeader()
    }
  }

  // Helper method to check if user is authenticated
  isAuthenticated () {
    if (!this._tokenManager) {
      return false
    }
    return this._tokenManager.hasTokens()
  }

  // Helper method to check if user has valid tokens
  hasValidTokens () {
    if (!this._tokenManager) {
      return false
    }
    return this._tokenManager.hasTokens() && this._tokenManager.isAccessTokenValid()
  }

  // Helper method to make HTTP requests
  async _request (endpoint, options = {}) {
    const url = `${this._apiUrl}/core${endpoint}`

    const defaultHeaders = {}

    // Only set Content-Type for JSON requests, not for FormData
    if (!(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json'
    }

    // Use TokenManager for automatic token management
    if (this._requiresInit(options.methodName) && this._tokenManager) {
      try {
        // Ensure we have a valid token (will refresh if needed)
        const validToken = await this._tokenManager.ensureValidToken()

        if (validToken) {
          const authHeader = this._tokenManager.getAuthHeader()
          if (authHeader) {
            defaultHeaders.Authorization = authHeader
          }
        }
      } catch (error) {
        console.warn('Token management failed, proceeding without authentication:', error)
      }
    } else if (this._requiresInit(options.methodName)) {
      // Fallback to context token if TokenManager not available
      const { authToken } = this._context
      if (authToken) {
        defaultHeaders.Authorization = `Bearer ${authToken}`
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      })

      if (!response.ok) {
        let error = { message: `HTTP ${response.status}: ${response.statusText}` }
        try {
          error = await response.json()
        } catch {
          // Use default error message
        }
        throw new Error(error.message || error.error || 'Request failed')
      }

      return response.status === 204 ? null : response.json()
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`)
    }
  }

  // ==================== AUTH METHODS ====================

  async register (userData) {
    try {
      const response = await this._request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
        methodName: 'register'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`)
    }
  }

  async login (email, password) {
    try {
      const response = await this._request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
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

        // Update context for backward compatibility
        this.updateContext({ authToken: tokens.accessToken })
      }

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`)
    }
  }

  async logout () {
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
      this.updateContext({ authToken: null })
    } catch (error) {
      // Even if the API call fails, clear local tokens
      if (this._tokenManager) {
        this._tokenManager.clearTokens()
      }
      this.updateContext({ authToken: null })

      throw new Error(`Logout failed: ${error.message}`)
    }
  }

  async refreshToken (refreshToken) {
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
      throw new Error(`Token refresh failed: ${error.message}`)
    }
  }

  async googleAuth (idToken) {
    try {
      const response = await this._request('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
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

        // Update context for backward compatibility
        this.updateContext({ authToken: tokens.accessToken })
      }

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Google auth failed: ${error.message}`)
    }
  }

  async githubAuth (code) {
    try {
      const response = await this._request('/auth/github', {
        method: 'POST',
        body: JSON.stringify({ code }),
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

        // Update context for backward compatibility
        this.updateContext({ authToken: tokens.accessToken })
      }

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`GitHub auth failed: ${error.message}`)
    }
  }

  async googleAuthCallback (code, redirectUri) {
    try {
      const response = await this._request('/auth/google/callback', {
        method: 'POST',
        body: JSON.stringify({ code, redirectUri }),
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

        // Update context for backward compatibility
        this.updateContext({ authToken: tokens.accessToken })
      }

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Google auth callback failed: ${error.message}`)
    }
  }

  async requestPasswordReset (email) {
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
      throw new Error(`Password reset request failed: ${error.message}`)
    }
  }

  async confirmPasswordReset (token, password) {
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
      throw new Error(`Password reset confirmation failed: ${error.message}`)
    }
  }

  async confirmRegistration (token) {
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
      throw new Error(`Registration confirmation failed: ${error.message}`)
    }
  }

  async requestPasswordChange () {
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
      throw new Error(`Password change request failed: ${error.message}`)
    }
  }

  async confirmPasswordChange (currentPassword, newPassword, code) {
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
      throw new Error(`Password change confirmation failed: ${error.message}`)
    }
  }

  async getMe () {
    this._requireReady('getMe')
    try {
      const response = await this._request('/auth/me', {
        method: 'GET',
        methodName: 'getMe'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`)
    }
  }

  /**
   * Get stored authentication state (backward compatibility method)
   * Replaces AuthService.getStoredAuthState()
   */
  async getStoredAuthState () {
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
          console.warn('[CoreService] Token refresh failed:', error.message)
          // Only clear tokens if it's definitely an auth error, not a network error
          if (error.message.includes('401') || error.message.includes('403') ||
              error.message.includes('invalid') || error.message.includes('expired')) {
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
        console.warn('[CoreService] Failed to get user data:', error.message)

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
      console.error('[CoreService] Unexpected error in getStoredAuthState:', error)
      return {
        userId: false,
        authToken: false,
        error: `Failed to get stored auth state: ${error.message}`
      }
    }
  }

  // ==================== USER METHODS ====================

  async getUserProfile () {
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
      throw new Error(`Failed to get user profile: ${error.message}`)
    }
  }

  async updateUserProfile (profileData) {
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
      throw new Error(`Failed to update user profile: ${error.message}`)
    }
  }

  async getUserProjects () {
    this._requireReady('getUserProjects')
    try {
      const response = await this._request('/users/projects', {
        method: 'GET',
        methodName: 'getUserProjects'
      })
      if (response.success) {
        return response.data.map(project => ({
          ...project,
          ...(project.icon && { icon: { src: `${this._apiUrl}/core/files/public/${project.icon.id}/download`, ...project.icon } })
        }))
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user projects: ${error.message}`)
    }
  }

  async getUser (userId) {
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
      throw new Error(`Failed to get user: ${error.message}`)
    }
  }

  async getUserByEmail (email) {
    this._requireReady('getUserByEmail')
    if (!email) {
      throw new Error('Email is required')
    }
    try {
      const response = await this._request('/auth/user', {
        method: 'GET',
        headers: {
          'X-User-Email': email
        },
        methodName: 'getUserByEmail'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get user by email: ${error.message}`)
    }
  }

  // ==================== PROJECT METHODS ====================

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
      throw new Error(`Failed to create project: ${error.message}`)
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
      const url = `/projects${queryString ? `?${queryString}` : ''}`

      const response = await this._request(url, {
        method: 'GET',
        methodName: 'getProjects'
      })
      if (response.success) {
        return response
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get projects: ${error.message}`)
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
      const url = `/projects/public${queryString ? `?${queryString}` : ''}`

      const response = await this._request(url, {
        method: 'GET',
        methodName: 'listPublicProjects'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list public projects: ${error.message}`)
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
        const iconSrc = response.data.icon ? `${this._apiUrl}/core/files/public/${response.data.icon.id}/download` : null
        return {
          ...response.data,
          icon: { src: iconSrc, ...response.data.icon }
        }
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project: ${error.message}`)
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
        const iconSrc = response.data.icon ? `${this._apiUrl}/core/files/public/${response.data.icon.id}/download` : null
        return {
          ...response.data,
          icon: { src: iconSrc, ...response.data.icon }
        }
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get public project: ${error.message}`)
    }
  }

  async getProjectByKey (key) {
    this._requireReady('getProjectByKey')
    if (!key) {
      throw new Error('Project key is required')
    }
    try {
      const response = await this._request(`/projects/check-key/${key}`, {
        method: 'GET',
        methodName: 'getProjectByKey'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project by key: ${error.message}`)
    }
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
      throw new Error(`Failed to update project: ${error.message}`)
    }
  }

  async updateProjectComponents (projectId, components) {
    this._requireReady('updateProjectComponents')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/components`, {
        method: 'PATCH',
        body: JSON.stringify({ components }),
        methodName: 'updateProjectComponents'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project components: ${error.message}`)
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
      throw new Error(`Failed to update project settings: ${error.message}`)
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
      throw new Error(`Failed to update project name: ${error.message}`)
    }
  }

  async updateProjectPackage (projectId, pkg) {
    this._requireReady('updateProjectPackage')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/tier`, {
        method: 'PATCH',
        body: JSON.stringify({ tier: pkg }),
        methodName: 'updateProjectPackage'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project package: ${error.message}`)
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
      throw new Error(`Failed to duplicate project: ${error.message}`)
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
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove project: ${error.message}`)
    }
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
      throw new Error(`Failed to check project key availability: ${error.message}`)
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
      throw new Error(`Failed to get project members: ${error.message}`)
    }
  }

  async inviteMember (projectId, email, role = 'guest', options = {}) {
    this._requireReady('inviteMember')
    if (!projectId || !email || !role) {
      throw new Error('Project ID, email, and role are required')
    }

    const { name, callbackUrl } = options

        // Default callbackUrl if not provided
    const defaultCallbackUrl = typeof window === 'undefined'
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
        methodName: 'inviteMember'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to invite member: ${error.message}`)
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
      throw new Error(`Failed to accept invite: ${error.message}`)
    }
  }

  async updateMemberRole (projectId, memberId, role) {
    this._requireReady('updateMemberRole')
    if (!projectId || !memberId || !role) {
      throw new Error('Project ID, member ID, and role are required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
        methodName: 'updateMemberRole'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update member role: ${error.message}`)
    }
  }

  async removeMember (projectId, memberId) {
    this._requireReady('removeMember')
    if (!projectId || !memberId) {
      throw new Error('Project ID and member ID are required')
    }
    try {
      const response = await this._request(`/projects/${projectId}/members/${memberId}`, {
        method: 'DELETE',
        methodName: 'removeMember'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove member: ${error.message}`)
    }
  }

  // ==================== PROJECT LIBRARY METHODS ====================

  async getAvailableLibraries (params = {}) {
    this._requireReady('getAvailableLibraries')
    const queryParams = new URLSearchParams(params).toString()
    try {
      const response = await this._request(`/projects/libraries/available?${queryParams}`, {
        method: 'GET',
        methodName: 'getAvailableLibraries'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get available libraries: ${error.message}`)
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
      throw new Error(`Failed to get project libraries: ${error.message}`)
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
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to add project libraries: ${error.message}`)
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
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove project libraries: ${error.message}`)
    }
  }

  // ==================== FILE METHODS ====================

  async uploadFile (file, options = {}) {
    this._requireReady('uploadFile')
    if (!file) {
      throw new Error('File is required for upload')
    }

    const formData = new FormData()
    formData.append('file', file)

    // Add optional parameters only if they exist
    if (options.projectId) {formData.append('projectId', options.projectId)}
    if (options.tags) {formData.append('tags', JSON.stringify(options.tags))}
    if (options.visibility) {formData.append('visibility', options.visibility || 'public')}
    if (options.metadata) {formData.append('metadata', JSON.stringify(options.metadata))}

    try {
      const response = await this._request('/files/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        methodName: 'uploadFile'
      })

      if (!response.success) {
        throw new Error(response.message)
      }

      return {
        id: response.data.id,
        src: `${this._apiUrl}/core/files/public/${response.data.id}/download`,
        success: true,
        message: response.message
      }
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`)
    }
  }

  async updateProjectIcon (projectId, iconFile) {
    this._requireReady('updateProjectIcon')
    if (!projectId || !iconFile) {
      throw new Error('Project ID and icon file are required')
    }

    const formData = new FormData()
    formData.append('icon', iconFile)
    formData.append('projectId', projectId)

    try {
      const response = await this._request('/files/upload-project-icon', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        methodName: 'updateProjectIcon'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project icon: ${error.message}`)
    }
  }

  // ==================== PAYMENT METHODS ====================

  async checkout (options = {}) {
    this._requireReady('checkout')
    const {
      projectId,
      seats = 1,
      price = 'starter_monthly',
      successUrl = `${window.location.origin}/success`,
      cancelUrl = `${window.location.origin}/pricing`
    } = options

    if (!projectId) {
      throw new Error('Project ID is required for checkout')
    }

    try {
      const response = await this._request('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          seats,
          price,
          successUrl,
          cancelUrl
        }),
        methodName: 'checkout'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to checkout: ${error.message}`)
    }
  }

  async getSubscriptionStatus (projectId) {
    this._requireReady('getSubscriptionStatus')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const response = await this._request(`/payments/subscription/${projectId}`, {
        method: 'GET',
        methodName: 'getSubscriptionStatus'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get subscription status: ${error.message}`)
    }
  }

  // ==================== DNS METHODS ====================

  async createDnsRecord (domain, options = {}) {
    this._requireReady('createDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request('/dns/records', {
        method: 'POST',
        body: JSON.stringify({ domain, ...options }),
        methodName: 'createDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create DNS record: ${error.message}`)
    }
  }

  async getDnsRecord (domain) {
    this._requireReady('getDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request(`/dns/records/${domain}`, {
        method: 'GET',
        methodName: 'getDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get DNS record: ${error.message}`)
    }
  }

  async removeDnsRecord (domain) {
    this._requireReady('removeDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request(`/dns/records/${domain}`, {
        method: 'DELETE',
        methodName: 'removeDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove DNS record: ${error.message}`)
    }
  }

  async setProjectDomains (projectKey, customDomain, hasCustomDomainAccess = false) {
    this._requireReady('setProjectDomains')
    if (!projectKey) {
      throw new Error('Project key is required')
    }
    try {
      const response = await this._request('/dns/project-domains', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          customDomain,
          hasCustomDomainAccess
        }),
        methodName: 'setProjectDomains'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to set project domains: ${error.message}`)
    }
  }

  // ==================== UTILITY METHODS ====================

  async getHealthStatus () {
    try {
      const response = await this._request('/health', {
        method: 'GET',
        methodName: 'getHealthStatus'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get health status: ${error.message}`)
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

    const {
      message,
      branch = 'main',
      type = 'patch'
    } = options

    try {
      const response = await this._request(`/projects/${projectId}/changes`, {
        method: 'POST',
        body: JSON.stringify({
          changes,
          message,
          branch,
          type
        }),
        methodName: 'applyProjectChanges'
      })

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to apply project changes: ${error.message}`)
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
      includeHistory = false
    } = options

    const queryParams = new URLSearchParams({
      branch,
      version,
      includeHistory: includeHistory.toString()
    }).toString()

    try {
      const response = await this._request(`/projects/${projectId}/data?${queryParams}`, {
        method: 'GET',
        methodName: 'getProjectData'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project data: ${error.message}`)
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

    const {
      branch = 'main',
      page = 1,
      limit = 50
    } = options

    const queryParams = new URLSearchParams({
      branch,
      page: page.toString(),
      limit: limit.toString()
    }).toString()

    try {
      const response = await this._request(`/projects/${projectId}/versions?${queryParams}`, {
        method: 'GET',
        methodName: 'getProjectVersions'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project versions: ${error.message}`)
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

    const {
      message,
      branch = 'main',
      type = 'patch'
    } = options

    try {
      const response = await this._request(`/projects/${projectId}/restore`, {
        method: 'POST',
        body: JSON.stringify({
          version,
          message,
          branch,
          type
        }),
        methodName: 'restoreProjectVersion'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to restore project version: ${error.message}`)
    }
  }

  /**
   * Helper method to update a single item in the project
   * Convenience wrapper around applyProjectChanges
   */
  async updateProjectItem (projectId, path, value, options = {}) {
    const changes = [['update', path, value]]
    const message = options.message || `Updated ${Array.isArray(path) ? path.join('.') : path}`

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
    const message = options.message || `Deleted ${Array.isArray(path) ? path.join('.') : path}`

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
    const message = options.message || `Set ${Array.isArray(path) ? path.join('.') : path}`

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
    const changes = items.map(item => {
      const [type, data] = item
      const { value, ...schema } = data
      return [
        ['update', [type, data.key], value],
        ['update', ['schema', type, data.key], schema]
      ]
    }).flat()

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

  // ==================== PULL REQUEST METHODS ====================

  /**
   * Create a new pull request
   */
  async createPullRequest (projectId, pullRequestData) {
    this._requireReady('createPullRequest')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!pullRequestData.source || !pullRequestData.target || !pullRequestData.title) {
      throw new Error('Source branch, target branch, and title are required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/pull-requests`, {
        method: 'POST',
        body: JSON.stringify(pullRequestData),
        methodName: 'createPullRequest'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error.message}`)
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

    const {
      status = 'open',
      source,
      target,
      page = 1,
      limit = 20
    } = options

    const queryParams = new URLSearchParams({
      status,
      page: page.toString(),
      limit: limit.toString()
    })

    if (source) {queryParams.append('source', source)}
    if (target) {queryParams.append('target', target)}

    try {
      const response = await this._request(`/projects/${projectId}/pull-requests?${queryParams.toString()}`, {
        method: 'GET',
        methodName: 'listPullRequests'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list pull requests: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/pull-requests/${prId}`, {
        method: 'GET',
        methodName: 'getPullRequest'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get pull request: ${error.message}`)
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
      throw new Error(`Invalid review status. Must be one of: ${validStatuses.join(', ')}`)
    }

    try {
      const response = await this._request(`/projects/${projectId}/pull-requests/${prId}/review`, {
        method: 'POST',
        body: JSON.stringify(reviewData),
        methodName: 'reviewPullRequest'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to review pull request: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/pull-requests/${prId}/comment`, {
        method: 'POST',
        body: JSON.stringify(commentData),
        methodName: 'addPullRequestComment'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to add pull request comment: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/pull-requests/${prId}/merge`, {
        method: 'POST',
        methodName: 'mergePullRequest'
      })

      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      // Handle specific merge conflict errors
      if (error.message.includes('conflicts') || error.message.includes('409')) {
        throw new Error(`Pull request has merge conflicts: ${error.message}`)
      }
      throw new Error(`Failed to merge pull request: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/pull-requests/${prId}/diff`, {
        method: 'GET',
        methodName: 'getPullRequestDiff'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get pull request diff: ${error.message}`)
    }
  }

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
        threads: [{
          comment,
          type: 'praise'
        }]
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
    return await this.listPullRequests(projectId, { ...options, status: 'open' })
  }

  async getClosedPullRequests (projectId, options = {}) {
    return await this.listPullRequests(projectId, { ...options, status: 'closed' })
  }

  async getMergedPullRequests (projectId, options = {}) {
    return await this.listPullRequests(projectId, { ...options, status: 'merged' })
  }

  /**
   * Helper method to check if a pull request is canMerge
   */
  async isPullRequestMergeable (projectId, prId) {
    try {
      const prData = await this.getPullRequest(projectId, prId)
      return prData?.data?.canMerge || false
    } catch (error) {
      throw new Error(`Failed to check pull request mergeability: ${error.message}`)
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
        approvedReviews: pr.reviews?.filter(r => r.status === 'approved').length || 0,
        changesRequested: pr.reviews?.filter(r => r.status === 'requested_changes').length || 0,
      }
    } catch (error) {
      throw new Error(`Failed to get pull request status summary: ${error.message}`)
    }
  }

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
      throw new Error(`Failed to list branches: ${error.message}`)
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
      throw new Error(`Failed to create branch: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/branches/${encodeURIComponent(branchName)}`, {
        method: 'DELETE',
        methodName: 'deleteBranch'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete branch: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/branches/${encodeURIComponent(branchName)}/rename`, {
        method: 'POST',
        body: JSON.stringify({ newName }),
        methodName: 'renameBranch'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to rename branch: ${error.message}`)
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

    if (versionId) {queryParams.append('versionId', versionId)}
    if (versionValue) {queryParams.append('versionValue', versionValue)}
    if (target) {queryParams.append('target', target)}

    const queryString = queryParams.toString()
    const url = `/projects/${projectId}/branches/${encodeURIComponent(branchName)}/changes${queryString ? `?${queryString}` : ''}`

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
      throw new Error(`Failed to get branch changes: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/branches/${encodeURIComponent(branchName)}/merge`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        methodName: 'mergeBranch'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      // Handle merge conflicts specifically
      if (error.message.includes('conflicts') || error.message.includes('409')) {
        throw new Error(`Merge conflicts detected: ${error.message}`)
      }
      throw new Error(`Failed to merge branch: ${error.message}`)
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
      const response = await this._request(`/projects/${projectId}/branches/${encodeURIComponent(branchName)}/reset`, {
        method: 'POST',
        methodName: 'resetBranch'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to reset branch: ${error.message}`)
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
      throw new Error(`Failed to publish version: ${error.message}`)
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

    const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/gu, '-')

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
      throw new Error(`Failed to check if branch exists: ${error.message}`)
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
    const branchName = `feature/${featureName.toLowerCase().replace(/[^a-z0-9-]/gu, '-')}`

    return await this.createBranch(projectId, {
      name: branchName,
      source: 'main'
    })
  }

  /**
   * Helper method to create a hotfix branch from main
   */
  async createHotfixBranch (projectId, hotfixName) {
    const branchName = `hotfix/${hotfixName.toLowerCase().replace(/[^a-z0-9-]/gu, '-')}`

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
      throw new Error(`Failed to get branch status: ${error.message}`)
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
        throw new Error(`Branch '${branchName}' has uncommitted changes. Use force option to delete anyway.`)
      }
    }

    return await this.deleteBranch(projectId, branchName)
  }

  // ==================== ADMIN METHODS ====================

  /**
   * Get admin users list with comprehensive filtering and search capabilities
   * Requires admin or super_admin global role
   */
  async getAdminUsers (params = {}) {
    this._requireReady('getAdminUsers')

    const {
      emails,
      ids,
      query,
      status,
      page = 1,
      limit = 50,
      sort = { field: 'createdAt', order: 'desc' }
    } = params

    const queryParams = new URLSearchParams()

    // Add query parameters
    if (emails) {
      queryParams.append('emails', emails)
    }
    if (ids) {
      queryParams.append('ids', ids)
    }
    if (query) {
      queryParams.append('query', query)
    }
    if (status) {
      queryParams.append('status', status)
    }
    if (page) {
      queryParams.append('page', page.toString())
    }
    if (limit) {
      queryParams.append('limit', limit.toString())
    }
    if (sort && sort.field) {
      queryParams.append('sort[field]', sort.field)
      queryParams.append('sort[order]', sort.order || 'desc')
    }

    const queryString = queryParams.toString()
    const url = `/users/admin/users${queryString ? `?${queryString}` : ''}`

    try {
      const response = await this._request(url, {
        method: 'GET',
        methodName: 'getAdminUsers'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get admin users: ${error.message}`)
    }
  }

  /**
   * Assign projects to a specific user
   * Requires admin or super_admin global role
   */
  async assignProjectsToUser (userId, options = {}) {
    this._requireReady('assignProjectsToUser')

    if (!userId) {
      throw new Error('User ID is required')
    }

    const {
      projectIds,
      role = 'guest'
    } = options

    const requestBody = {
      userId,
      role
    }

    // Only include projectIds if provided (otherwise assigns all projects)
    if (projectIds && Array.isArray(projectIds)) {
      requestBody.projectIds = projectIds
    }

    try {
      const response = await this._request('/assign-projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        methodName: 'assignProjectsToUser'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to assign projects to user: ${error.message}`)
    }
  }

  /**
   * Helper method for admin users search
   */
  async searchAdminUsers (searchQuery, options = {}) {
    return await this.getAdminUsers({
      query: searchQuery,
      ...options
    })
  }

  /**
   * Helper method to get admin users by email list
   */
  async getAdminUsersByEmails (emails, options = {}) {
    const emailList = Array.isArray(emails) ? emails.join(',') : emails
    return await this.getAdminUsers({
      emails: emailList,
      ...options
    })
  }

  /**
   * Helper method to get admin users by ID list
   */
  async getAdminUsersByIds (ids, options = {}) {
    const idList = Array.isArray(ids) ? ids.join(',') : ids
    return await this.getAdminUsers({
      ids: idList,
      ...options
    })
  }

  /**
   * Helper method to assign specific projects to a user with a specific role
   */
  async assignSpecificProjectsToUser (userId, projectIds, role = 'guest') {
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      throw new Error('Project IDs must be a non-empty array')
    }

    return await this.assignProjectsToUser(userId, {
      projectIds,
      role
    })
  }

  /**
   * Helper method to assign all projects to a user with a specific role
   */
  async assignAllProjectsToUser (userId, role = 'guest') {
    return await this.assignProjectsToUser(userId, {
      role
    })
  }

  // Cleanup
  destroy () {
    if (this._tokenManager) {
      this._tokenManager.destroy()
      this._tokenManager = null
    }
    this._client = null
    this._initialized = false
    this._setReady(false)
  }
}