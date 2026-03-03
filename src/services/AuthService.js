/* eslint-disable require-await */
import { BaseService } from './BaseService.js'
import {
  PERMISSION_MAP,
  ROLE_PERMISSIONS,
  TIER_FEATURES,
  PROJECT_ROLE_PERMISSIONS
} from '../utils/permission.js'

export class AuthService extends BaseService {
  constructor (config) {
    super(config)
    this._userRoles = new Set(['guest', 'editor', 'admin', 'owner'])
    this._projectTiers = new Set([
      'ready',
      'free',
      'pro1',
      'pro2',
      'enterprise'
    ])
    this._initialized = false
  }

  // eslint-disable-next-line no-empty-pattern
  init ({}) {
    try {
      const { authToken, appKey } = this._context || {}

      // Store masked configuration info
      this._info = {
        config: {
          appKey: appKey
            ? `${appKey.substr(0, 4)}...${appKey.substr(-4)}`
            : undefined, // eslint-disable-line no-undefined
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

  _requiresInit (methodName) {
    const noInitMethods = new Set([
      'users:login',
      'users:register',
      'users:request-password-reset',
      'users:reset-password',
      'users:reset-password-confirm',
      'users:register-confirmation',
      'users:google-auth',
      'users:github-auth'
    ])
    return !noInitMethods.has(methodName)
  }

  _requireReady (methodName) {
    if (this._requiresInit(methodName) && !this._initialized) {
      throw new Error('Service not initialized')
    }
  }

  _getBasedService (methodName) {
    const based = this._context.services?.based
    if (this._requiresInit(methodName) && !based) {
      throw new Error('Based service not available')
    }
    return based._client
  }

  async login (identifier, password) {
    try {
      const based = this._getBasedService('login')
      const response = await based.call('users:login', { identifier, password })

      if (this._initialized) {
        this.updateContext({ authToken: response.token })
      }
      based.setAuthState({
        token: response.token,
        userId: response.userId,
        projectRoles: response.projectRoles,
        globalRole: response.globalRole,
        persistent: true
      })

      return response
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`)
    }
  }

  async register (userData) {
    try {
      const based = this._getBasedService('register')
      return await based.call('users:register', userData)
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`)
    }
  }

  async googleAuth (idToken) {
    try {
      const based = this._getBasedService('googleAuth')
      const response = await based.call('users:google-auth', { idToken })

      if (this._initialized) {
        this.updateContext({ authToken: response.token })
      }

      based.setAuthState({
        token: response.token,
        userId: response.userId,
        persistent: true
      })

      return response
    } catch (error) {
      throw new Error(`Google auth failed: ${error.message}`)
    }
  }

  async googleAuthCallback (code, redirectUri) {
    try {
      const based = this._getBasedService('googleAuthCallback')
      const response = await based.call('users:google-auth-callback', {
        code,
        redirectUri
      })

      if (this._initialized) {
        this.updateContext({ authToken: response.token })
      }

      based.setAuthState({
        token: response.token,
        userId: response.userId,
        persistent: true
      })
      return response
    } catch (error) {
      throw new Error(`Google auth callback failed: ${error.message}`)
    }
  }

  async githubAuth (code) {
    try {
      const based = this._getBasedService('githubAuth')
      const response = await based.call('users:github-auth', { code })

      if (this._initialized) {
        this.updateContext({ authToken: response.token })
      }

      based.setAuthState({
        token: response.token,
        userId: response.userId,
        persistent: true
      })

      return response
    } catch (error) {
      throw new Error(`GitHub auth failed: ${error.message}`)
    }
  }

  async logout () {
    this._requireReady('logout')
    try {
      const based = this._getBasedService('logout')
      await based.call('users:logout')
      this.updateContext({ authToken: null })
    } catch (error) {
      throw new Error(`Logout failed: ${error.message}`)
    }
  }

  async updateUserRole (userId, newRole) {
    this._requireReady('updateUserRole')
    if (!userId) {
      throw new Error('User ID is required')
    }
    if (!this._userRoles.has(newRole)) {
      throw new Error(`Invalid role: ${newRole}`)
    }
    try {
      const based = this._getBasedService('updateUserRole')
      return await based.call('users:update-role', { userId, role: newRole })
    } catch (error) {
      throw new Error(`Failed to update user role: ${error.message}`)
    }
  }

  async updateProjectTier (projectId, newTier) {
    this._requireReady('updateProjectTier')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!this._projectTiers.has(newTier)) {
      throw new Error(`Invalid project tier: ${newTier}`)
    }
    try {
      const based = this._getBasedService('updateProjectTier')
      return await based.call('projects:update-tier', {
        projectId,
        tier: newTier
      })
    } catch (error) {
      throw new Error(`Failed to update project tier: ${error.message}`)
    }
  }

  hasPermission (requiredPermission) {
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

  hasGlobalPermission (globalRole, requiredPermission) {
    return ROLE_PERMISSIONS[globalRole]?.includes(requiredPermission) || false
  }

  checkProjectPermission (projectRole, requiredPermission) {
    return (
      PROJECT_ROLE_PERMISSIONS[projectRole]?.includes(requiredPermission) ||
      false
    )
  }

  checkProjectFeature (projectTier, feature) {
    if (feature.startsWith('aiCopilot') || feature.startsWith('aiChatbot')) {
      const [featureBase] = feature.split(':')
      const tierFeature = TIER_FEATURES[projectTier]?.find(f =>
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
  async canPerformOperation (projectId, operation, options = {}) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const { checkFeatures = true, requireAll = true } = options

    const operationConfig = this._permissionMap[operation]
    if (!operationConfig) {
      return false
    }
    if (!operationConfig) {
      return false
    }

    const { permissions = [], features = [] } = operationConfig

    try {
      // Check permissions
      const permissionResults = await Promise.all(
        permissions.map(permission =>
          this.hasProjectPermission(projectId, permission)
        )
      )

      const hasPermissions = requireAll
        ? permissionResults.every(Boolean)
        : permissionResults.some(Boolean)

      if (!hasPermissions) {
        return false
      }
      if (!hasPermissions) {
        return false
      }

      // Check features if required
      if (checkFeatures && features.length > 0) {
        const featureResults = features.map(feature => {
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
  async withPermission (projectId, operation, action) {
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

  // Project access information
  async getProjectAccess (projectId) {
    this._requireReady()
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const operations = Object.keys(PERMISSION_MAP)

    const access = await Promise.all(
      operations.map(async operation => {
        const allowed = await this.canPerformOperation(projectId, operation)
        const config = PERMISSION_MAP[operation]

        return {
          operation,
          allowed,
          permissions: config.permissions,
          features: config.features,
          aiTokens: operation.startsWith('ai')
            ? this._getAITokens(projectId, operation.replace('ai', ''))
            : null
        }
      })
    )

    return {
      projectId,
      permissions: access.reduce(
        (acc, { operation, ...details }) => ({
          ...acc,
          [operation]: details
        }),
        {}
      ),
      timestamp: new Date().toISOString()
    }
  }

  // AI token management
  _getAITokens (projectId, featureType) {
    const tokenFeatures = [
      `ai${featureType}:3`,
      `ai${featureType}:5`,
      `ai${featureType}:15`
    ]

    return tokenFeatures.reduce((total, feature) => {
      const tokens = this.hasProjectFeature(projectId, feature)
      return total + (typeof tokens === 'number' ? tokens : 0)
    }, 0)
  }

  async getProjectMembers (projectId) {
    this._requireReady('getProjectMembers')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    try {
      const based = this._getBasedService('getProjectMembers')
      return await based.call('projects:get-members', { projectId })
    } catch (error) {
      if (error.message?.includes('Authentication failed. Please try again'))
        window.location.reload()
      throw new Error(`Failed to get project members: ${error.message}`)
    }
  }

  async inviteMember (projectId, email, role, name, callbackUrl) {
    this._requireReady('inviteMember')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!email) {
      throw new Error('Email is required')
    }
    if (!callbackUrl || Object.keys(callbackUrl).length === 0) {
      throw new Error('Callback Url is required')
    }
    if (!role || !this._userRoles.has(role)) {
      throw new Error(`Invalid role: ${role}`)
    }
    try {
      const based = this._getBasedService('inviteMember')
      return await based.call('projects:invite-member', {
        projectId,
        email,
        role,
        name,
        callbackUrl
      })
    } catch (error) {
      throw new Error(`Failed to invite member: ${error.message}`)
    }
  }

  async acceptInvite (token) {
    this._requireReady('acceptInvite')
    try {
      const based = this._getBasedService('acceptInvite')
      return await based.call('projects:accept-invite', { token })
    } catch (error) {
      throw new Error(`Failed to accept invite: ${error.message}`)
    }
  }

  async updateMemberRole (projectId, userId, role) {
    this._requireReady('updateMemberRole')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!userId) {
      throw new Error('User ID is required')
    }
    if (!this._userRoles.has(role)) {
      throw new Error(`Invalid role: ${role}`)
    }
    try {
      const based = this._getBasedService('updateMemberRole')
      return await based.call('projects:update-member-role', {
        projectId,
        userId,
        role
      })
    } catch (error) {
      throw new Error(`Failed to update member role: ${error.message}`)
    }
  }

  async removeMember (projectId, userId) {
    this._requireReady('removeMember')
    if (!projectId || !userId) {
      throw new Error('Project ID and user ID are required')
    }
    try {
      const based = this._getBasedService('removeMember')
      return await based.call('projects:remove-member', { projectId, userId })
    } catch (error) {
      throw new Error(`Failed to remove member: ${error.message}`)
    }
  }

  async confirmRegistration (token) {
    try {
      const based = this._getBasedService('confirmRegistration')
      return await based.call('users:register-confirmation', { token })
    } catch (error) {
      throw new Error(`Registration confirmation failed: ${error.message}`)
    }
  }

  async requestPasswordReset (email, callbackUrl) {
    try {
      const based = this._getBasedService('requestPasswordReset')
      return await based.call('users:reset-password', { email, callbackUrl })
    } catch (error) {
      throw new Error(`Password reset request failed: ${error.message}`)
    }
  }

  async confirmPasswordReset (token, newPassword) {
    try {
      const based = this._getBasedService('confirmPasswordReset')
      return await based.call('users:reset-password-confirm', {
        token,
        newPassword
      })
    } catch (error) {
      throw new Error(`Password reset confirmation failed: ${error.message}`)
    }
  }

  async getStoredAuthState () {
    try {
      const based = this._getBasedService('getStoredAuthState')
      const { authState } = based

      if (authState?.token) {
        return {
          userId: authState.userId,
          authToken: authState.token,
          projectRoles: authState.projectRoles,
          globalRole: authState.globalRole,
          error: null
        }
      }

      return {
        userId: false,
        authToken: false
      }
    } catch (error) {
      this._setError(error)
      return {
        userId: false,
        authToken: false,
        error: `Failed to get stored auth state: ${error.message}`
      }
    }
  }

  async subscribeToAuthChanges (callback) {
    const based = this._getBasedService('subscribeToAuthChanges')
    based.on('authstate-change', async authState => {
      const formattedState = authState?.token
        ? {
            userId: authState.userId,
            authToken: authState.token,
            projectRoles: authState.projectRoles,
            globalRole: authState.globalRole,
            error: null
          }
        : {
            userId: false,
            authToken: false
          }
      await callback(formattedState)
    })

    return () => based.off('authstate-change')
  }
}
