import { AuthService } from './AuthService.js'
import { AiChatService } from './AiChatService.js'
import { AiService } from './AiService.js'
import { DocService } from './DocService.js'
import { TicketService } from './TicketService.js'
import { AnalyzedService } from './AnalyzedService.js'
import { ResourceLinkService } from './ResourceLinkService.js'
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
import { WorkspaceService } from './WorkspaceService.js'
// WorkspaceProjectService + the Supabase passthrough helpers live in
// the sibling @symbo.ls/workspace-project-supabase package — we re-export
// them through ./index.js so the historic import shape
// (`import { WorkspaceProjectService, createSupabasePassthroughConfig }
// from '@symbo.ls/sdk'`) keeps working.
import {
  WorkspaceProjectService,
  workspaceProjectBaseUrl,
  createSupabasePassthroughConfig,
  workspaceProjectEdgeFunctionUrl,
  workspaceExtensionSessionAccessToken,
} from '@symbo.ls/workspace-project-supabase'
import { AllocationRuleService } from './AllocationRuleService.js'
import { SharedAssetService } from './SharedAssetService.js'
import { CreditsService } from './CreditsService.js'
// Phase-1 spine services (WORKSPACE_DATA_MODEL §6.5/§6.8/§7/§8) — Mongo-
// native, peers to Ticket/Doc/Analyzed over the main server's /core/* routes.
import { ProposedActionService } from './ProposedActionService.js'
import { WorkflowService } from './WorkflowService.js'
import { FieldDefService } from './FieldDefService.js'
import { RecordCollectionService } from './RecordCollectionService.js'
// Phase-2 directory services (WORKSPACE_DATA_MODEL §5) — the Party Directory:
// Mongo-native, peers to the spine over the main server's /core/* routes.
import { PartyService } from './PartyService.js'
import { InteractionService } from './InteractionService.js'
import { SegmentService } from './SegmentService.js'
import { CanvasLayoutService } from './CanvasLayoutService.js'
import { MeetService } from './MeetService.js'
import { CalendarService } from './CalendarService.js'
import { BuildsService } from './BuildsService.js'

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

// Workspace service factory. Intranet org switcher + /data/organizations
// enrichment both depend on listWorkspaces here.
export const createWorkspaceService = config =>
  createService(WorkspaceService, config)

// Workspace-project service — typed surface against
// next.api.symbols.app/workspace-project/* (the
// @symbo-ls/server-workspace-project wrapper). Distinct from
// WorkspaceService (workspace-org CRUD via /core/workspaces).
export const createWorkspaceProjectService = config =>
  createService(WorkspaceProjectService, config)

export const createAiChatService = config =>
  createService(AiChatService, config)

// Unified AI surface — single entry point for every UI consumer
// (AppAssistant, CanvasPromptTextarea, ticket standup/detail, simone
// extension). Routes by provider mode (simone / providers / local),
// classifies intent (build / answer / action), and respects authMode
// (ask / auto). See AiService.js for the full contract.
export const createAiService = config =>
  createService(AiService, config)

export const createDocService = config =>
  createService(DocService, config)

export const createTicketService = config =>
  createService(TicketService, config)

export const createAnalyzedService = config =>
  createService(AnalyzedService, config)

export const createResourceLinkService = config =>
  createService(ResourceLinkService, config)

export const createAllocationRuleService = config =>
  createService(AllocationRuleService, config)

export const createSharedAssetService = config =>
  createService(SharedAssetService, config)

export const createCreditsService = config =>
  createService(CreditsService, config)

export const createCanvasLayoutService = config =>
  createService(CanvasLayoutService, config)

// Builds & Deploy — workspace-scoped /core/builds/* pipeline (GitHub App →
// Cloud Build/buildpacks → Cloud Run). Backs the /infra deployment canvas.
export const createBuildsService = config =>
  createService(BuildsService, config)

// Meet service — guest waiting-room flow (anonymous) + host-side remote
// mute against /core/meet/* on the main server. Replaces the legacy
// meet-guest-* Supabase Edge Function raw-fetch calls.
export const createMeetService = config =>
  createService(MeetService, config)

// Calendar service — workspace-scoped calendar events against
// /core/calendar/events on the main server. DORMANT until CALENDAR_STORE is
// flipped off 'supabase' (Supabase → Mongo migration Phase 4). Writes are
// owner/admin-gated server-side (calendar-agnostic-spec.md §7).
export const createCalendarService = config =>
  createService(CalendarService, config)

// Phase-1 spine factories — the polymorphic-spine surfaces every entity
// (shared + records) hangs on. See WORKSPACE_DATA_MODEL §7.
export const createProposedActionService = config =>
  createService(ProposedActionService, config)

export const createWorkflowService = config =>
  createService(WorkflowService, config)

export const createFieldDefService = config =>
  createService(FieldDefService, config)

export const createRecordCollectionService = config =>
  createService(RecordCollectionService, config)

// Phase-2 directory factories — the Party Directory surfaces (parties +
// their roles/relationships sub-resources, interactions, segments). See
// WORKSPACE_DATA_MODEL §5.
export const createPartyService = config =>
  createService(PartyService, config)

export const createInteractionService = config =>
  createService(InteractionService, config)

export const createSegmentService = config =>
  createService(SegmentService, config)

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
  WorkspaceService,
  WorkspaceProjectService,
  workspaceProjectBaseUrl,
  createSupabasePassthroughConfig,
  workspaceProjectEdgeFunctionUrl,
  workspaceExtensionSessionAccessToken,
  AiChatService,
  AiService,
  DocService,
  TicketService,
  AnalyzedService,
  ResourceLinkService,
  AllocationRuleService,
  SharedAssetService,
  CreditsService,
  CanvasLayoutService,
  MeetService,
  CalendarService,
  BuildsService,
  ProposedActionService,
  WorkflowService,
  FieldDefService,
  RecordCollectionService,
  PartyService,
  InteractionService,
  SegmentService
}
