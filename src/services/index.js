
import { AuthService } from './AuthService.js'
import { CoreService } from './CoreService.js'
import { CollabService } from './CollabService.js'

const createService = (ServiceClass, config) => new ServiceClass(config)

// Export service creators
export const createAuthService = config => createService(AuthService, config)

export const createCoreService = config => createService(CoreService, config)

export const createCollabService = config =>
  createService(CollabService, config)

export { AuthService, CoreService, CollabService }
