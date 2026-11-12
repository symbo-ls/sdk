// The service registry — one entry per service the SDK builds, in the order
// `sdk.initialize()` has always built them. `src/sdk.js` reads it; nothing
// else should.
//
// Two kinds of entry:
//
//   core: true  — statically imported here, so it is in every bundle that
//                 imports the SDK, and `initialize()` always builds it. A
//                 service is core when a consumer can reach it SYNCHRONOUSLY
//                 (a flat `sdk.<method>` in utils/services.js that answers a
//                 value, not a Promise — getAuthToken, isConnected,
//                 validateDomain, getFileUrl, shareUrl, trackEvent, …), when
//                 it owns a switchOrg/switchWorkspace hook that must run even
//                 if nobody called it yet (persona, workspaceProject), or
//                 when the boot path calls it (boot).
//
//   core: false — loaded with a literal `import()` on its first use when the
//                 SDK runs with `lazyServices: true`. A bundler that splits
//                 (Parcel, esbuild --splitting) moves each one out of the
//                 entry file. A bundler that does not split (the IIFE build)
//                 inlines it, so that format costs nothing. Without
//                 `lazyServices` the SDK loads every entry in initialize()
//                 exactly as before.
//
// `className` names the export of `./<className>.js`; tests check that each
// loader resolves to that export of services/index.js.
//
// Keep each `import()` a string literal: a bundler only splits what it can
// read statically.
import { AuthService } from './AuthService.js'
import { CollabService } from './CollabService.js'
import { FileService } from './FileService.js'
import { PaymentService } from './PaymentService.js'
import { DnsService } from './DnsService.js'
import { BranchService } from './BranchService.js'
import { PullRequestService } from './PullRequestService.js'
import { AdminService } from './AdminService.js'
import { TrackingService } from './TrackingService.js'
import { BootService } from './BootService.js'
import { WorkspaceProjectService } from './WorkspaceProjectService.js'
import { ShareLinkService } from './ShareLinkService.js'
import { PersonaService } from './PersonaService.js'

const core = (className, ServiceClass) => Object.freeze({ className, core: true, load: () => ServiceClass })

export const SERVICE_REGISTRY = Object.freeze({
  auth: core('AuthService', AuthService),
  collab: core('CollabService', CollabService),
  project: { className: 'ProjectService', load: () => import('./ProjectService.js').then((m) => m.ProjectService) },
  plan: { className: 'PlanService', load: () => import('./PlanService.js').then((m) => m.PlanService) },
  subscription: { className: 'SubscriptionService', load: () => import('./SubscriptionService.js').then((m) => m.SubscriptionService) },
  file: core('FileService', FileService),
  payment: core('PaymentService', PaymentService),
  dns: core('DnsService', DnsService),
  branch: core('BranchService', BranchService),
  pullRequest: core('PullRequestService', PullRequestService),
  admin: core('AdminService', AdminService),
  screenshot: { className: 'ScreenshotService', load: () => import('./ScreenshotService.js').then((m) => m.ScreenshotService) },
  tracking: core('TrackingService', TrackingService),
  waitlist: { className: 'WaitlistService', load: () => import('./WaitlistService.js').then((m) => m.WaitlistService) },
  onboardingResearch: { className: 'OnboardingResearchService', load: () => import('./OnboardingResearchService.js').then((m) => m.OnboardingResearchService) },
  onboarding: { className: 'PublicOnboardingService', load: () => import('./PublicOnboardingService.js').then((m) => m.PublicOnboardingService) },
  imports: { className: 'ImportsService', load: () => import('./ImportsService.js').then((m) => m.ImportsService) },
  metrics: { className: 'MetricsService', load: () => import('./MetricsService.js').then((m) => m.MetricsService) },
  integration: { className: 'IntegrationService', load: () => import('./IntegrationService.js').then((m) => m.IntegrationService) },
  featureFlag: { className: 'FeatureFlagService', load: () => import('./FeatureFlagService.js').then((m) => m.FeatureFlagService) },
  organization: { className: 'OrganizationService', load: () => import('./OrganizationService.js').then((m) => m.OrganizationService) },
  workspace: { className: 'WorkspaceService', load: () => import('./WorkspaceService.js').then((m) => m.WorkspaceService) },
  boot: core('BootService', BootService),
  mcpConnector: { className: 'McpConnectorService', load: () => import('./McpConnectorService.js').then((m) => m.McpConnectorService) },
  voice: { className: 'VoiceService', load: () => import('./VoiceService.js').then((m) => m.VoiceService) },
  workspaceProject: core('WorkspaceProjectService', WorkspaceProjectService),
  aiChat: { className: 'AiChatService', load: () => import('./AiChatService.js').then((m) => m.AiChatService) },
  ai: { className: 'AiService', load: () => import('./AiService.js').then((m) => m.AiService) },
  docs: { className: 'DocService', load: () => import('./DocService.js').then((m) => m.DocService) },
  tickets: { className: 'TicketService', load: () => import('./TicketService.js').then((m) => m.TicketService) },
  fleet: { className: 'FleetService', load: () => import('./FleetService.js').then((m) => m.FleetService) },
  assistants: { className: 'AssistantsService', load: () => import('./AssistantsService.js').then((m) => m.AssistantsService) },
  aiBoards: { className: 'AiBoardsService', load: () => import('./AiBoardsService.js').then((m) => m.AiBoardsService) },
  analyzed: { className: 'AnalyzedService', load: () => import('./AnalyzedService.js').then((m) => m.AnalyzedService) },
  growth: { className: 'GrowthService', load: () => import('./GrowthService.js').then((m) => m.GrowthService) },
  proposedActions: { className: 'ProposedActionService', load: () => import('./ProposedActionService.js').then((m) => m.ProposedActionService) },
  workflows: { className: 'WorkflowService', load: () => import('./WorkflowService.js').then((m) => m.WorkflowService) },
  fieldDefs: { className: 'FieldDefService', load: () => import('./FieldDefService.js').then((m) => m.FieldDefService) },
  recordCollections: { className: 'RecordCollectionService', load: () => import('./RecordCollectionService.js').then((m) => m.RecordCollectionService) },
  parties: { className: 'PartyService', load: () => import('./PartyService.js').then((m) => m.PartyService) },
  interactions: { className: 'InteractionService', load: () => import('./InteractionService.js').then((m) => m.InteractionService) },
  leads: { className: 'LeadService', load: () => import('./LeadService.js').then((m) => m.LeadService) },
  deals: { className: 'DealService', load: () => import('./DealService.js').then((m) => m.DealService) },
  leadSources: { className: 'LeadSourceService', load: () => import('./LeadSourceService.js').then((m) => m.LeadSourceService) },
  channels: { className: 'ChannelService', load: () => import('./ChannelService.js').then((m) => m.ChannelService) },
  crm: { className: 'CrmService', load: () => import('./CrmService.js').then((m) => m.CrmService) },
  segments: { className: 'SegmentService', load: () => import('./SegmentService.js').then((m) => m.SegmentService) },
  products: { className: 'ProductService', load: () => import('./ProductService.js').then((m) => m.ProductService) },
  prices: { className: 'PriceService', load: () => import('./PriceService.js').then((m) => m.PriceService) },
  companyProfile: { className: 'CompanyProfileService', load: () => import('./CompanyProfileService.js').then((m) => m.CompanyProfileService) },
  agreements: { className: 'AgreementService', load: () => import('./AgreementService.js').then((m) => m.AgreementService) },
  invoices: { className: 'InvoiceService', load: () => import('./InvoiceService.js').then((m) => m.InvoiceService) },
  transactions: { className: 'TransactionService', load: () => import('./TransactionService.js').then((m) => m.TransactionService) },
  comments: { className: 'CommentService', load: () => import('./CommentService.js').then((m) => m.CommentService) },
  attachments: { className: 'AttachmentService', load: () => import('./AttachmentService.js').then((m) => m.AttachmentService) },
  watchers: { className: 'WatcherService', load: () => import('./WatcherService.js').then((m) => m.WatcherService) },
  activityEntries: { className: 'ActivityEntryService', load: () => import('./ActivityEntryService.js').then((m) => m.ActivityEntryService) },
  tags: { className: 'TagService', load: () => import('./TagService.js').then((m) => m.TagService) },
  registry: { className: 'RegistryService', load: () => import('./RegistryService.js').then((m) => m.RegistryService) },
  bookings: { className: 'BookingService', load: () => import('./BookingService.js').then((m) => m.BookingService) },
  availabilityRules: { className: 'AvailabilityRuleService', load: () => import('./AvailabilityRuleService.js').then((m) => m.AvailabilityRuleService) },
  conversations: { className: 'ConversationService', load: () => import('./ConversationService.js').then((m) => m.ConversationService) },
  recurrences: { className: 'RecurrenceService', load: () => import('./RecurrenceService.js').then((m) => m.RecurrenceService) },
  mail: { className: 'MailService', load: () => import('./MailService.js').then((m) => m.MailService) },
  resourceLinks: { className: 'ResourceLinkService', load: () => import('./ResourceLinkService.js').then((m) => m.ResourceLinkService) },
  shareLinks: core('ShareLinkService', ShareLinkService),
  allocationRule: { className: 'AllocationRuleService', load: () => import('./AllocationRuleService.js').then((m) => m.AllocationRuleService) },
  sharedAsset: { className: 'SharedAssetService', load: () => import('./SharedAssetService.js').then((m) => m.SharedAssetService) },
  credits: { className: 'CreditsService', load: () => import('./CreditsService.js').then((m) => m.CreditsService) },
  canvasLayout: { className: 'CanvasLayoutService', load: () => import('./CanvasLayoutService.js').then((m) => m.CanvasLayoutService) },
  refs: { className: 'RefsService', load: () => import('./RefsService.js').then((m) => m.RefsService) },
  builds: { className: 'BuildsService', load: () => import('./BuildsService.js').then((m) => m.BuildsService) },
  meet: { className: 'MeetService', load: () => import('./MeetService.js').then((m) => m.MeetService) },
  calendar: { className: 'CalendarService', load: () => import('./CalendarService.js').then((m) => m.CalendarService) },
  storefront: { className: 'StorefrontService', load: () => import('./StorefrontService.js').then((m) => m.StorefrontService) },
  publicRecords: { className: 'PublicCollectionService', load: () => import('./PublicCollectionService.js').then((m) => m.PublicCollectionService) },
  publicBookings: { className: 'PublicBookingService', load: () => import('./PublicBookingService.js').then((m) => m.PublicBookingService) },
  persona: core('PersonaService', PersonaService)
})

// Service names in build order.
export const SERVICE_NAMES = Object.freeze(Object.keys(SERVICE_REGISTRY))

// The names `initialize()` builds in lazy mode.
export const CORE_SERVICE_NAMES = Object.freeze(
  SERVICE_NAMES.filter((name) => SERVICE_REGISTRY[name].core === true)
)

// Flat `sdk.<method>` proxies of NON-core services that answer a stop
// handle synchronously (a function, never a Promise). Before such a service
// has loaded, the proxy answers a deferred stop handle at once and starts the
// real subscription when the service arrives — see utils/lazyServices.js.
// A lazy-service method that answers any other synchronous value must not
// exist: make its service core instead (lazyServices.test.js checks it).
export const SYNC_HANDLE_METHODS = Object.freeze(new Set([
  'streamResearch',
  'subscribeWorkspaceCanvasLayout',
  'subscribeWorkspaceFileCanvas',
  'subscribeWorkspaceBuilds',
  'subscribeStorefrontEvents'
]))
