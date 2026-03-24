import { AuthService } from './AuthService.js'
import { CollabService } from './CollabService.js'
import { ProjectService } from './ProjectService.js'
import { PlanService } from './PlanService.js'
import { SubscriptionService } from './SubscriptionService.js'
import { FileService } from './FileService.js'
import { PaymentService } from './PaymentService.js'
import { DnsService } from './DnsService.js'
import { BranchService } from './BranchService.js'
import { PullRequestService } from './PullRequestService.js'
import { AdminService } from './AdminService.js'
import { ScreenshotService } from './ScreenshotService.js'
import { TrackingService } from './TrackingService.js'
import { WaitlistService } from './WaitlistService.js'
import { MetricsService } from './MetricsService.js'
import { IntegrationService } from './IntegrationService.js'
import { FeatureFlagService } from './FeatureFlagService.js'
import { OrganizationService } from './OrganizationService.js'
import { KvService } from './KvService.js'

const createService = (ServiceClass, config) => new ServiceClass(config)

// Export service creators
export const createAuthService = config => createService(AuthService, config)

export const createCollabService = config =>
  createService(CollabService, config)

export const createProjectService = config =>
  createService(ProjectService, config)

export const createPlanService = config =>
  createService(PlanService, config)

export const createSubscriptionService = config =>
  createService(SubscriptionService, config)

export const createFileService = config =>
  createService(FileService, config)

export const createPaymentService = config =>
  createService(PaymentService, config)

export const createDnsService = config =>
  createService(DnsService, config)

export const createBranchService = config =>
  createService(BranchService, config)

export const createPullRequestService = config =>
  createService(PullRequestService, config)

export const createAdminService = config =>
  createService(AdminService, config)

export const createScreenshotService = config =>
  createService(ScreenshotService, config)

export const createTrackingService = config =>
  createService(TrackingService, config)

export const createWaitlistService = config =>
  createService(WaitlistService, config)

export const createMetricsService = config =>
  createService(MetricsService, config)

export const createIntegrationService = config =>
  createService(IntegrationService, config)

export const createFeatureFlagService = config =>
  createService(FeatureFlagService, config)

export const createOrganizationService = config =>
  createService(OrganizationService, config)

export const createKvService = config =>
  createService(KvService, config)

export {
  AuthService,
  CollabService,
  ProjectService,
  PlanService,
  SubscriptionService,
  FileService,
  PaymentService,
  DnsService,
  BranchService,
  PullRequestService,
  AdminService,
  ScreenshotService,
  TrackingService,
  WaitlistService,
  MetricsService,
  IntegrationService,
  FeatureFlagService,
  OrganizationService,
  KvService
}
