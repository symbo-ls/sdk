export const PERMISSION_MAP = {
  // Content & Design Operations
  edit: {
    permissions: ['editMode', 'showCode'],
    features: ['editMode']
  },
  view: {
    permissions: ['showContent', 'platformSettings'],
    features: ['canvasPages']
  },
  design: {
    permissions: ['editMode', 'showCode'],
    features: ['accessToSymbolsLibrary', 'marketplace']
  },

  // Project Management
  manage: {
    permissions: ['projectSettings', 'iam'],
    features: ['workspaceAdministration', 'teamRolesAndPermissions']
  },
  configure: {
    permissions: ['projectSettings', 'branchProtection'],
    features: ['customBackendIntegration', 'integrationsSDK']
  },
  invite: {
    permissions: ['inviteMembers'],
    features: ['inviteMembersIAM']
  },

  // Version Control
  branch: {
    permissions: ['versions', 'branchProtection'],
    features: ['branching', 'versionHistory']
  },
  merge: {
    permissions: ['versions', 'branchProtection'],
    features: ['branching']
  },

  // Export & Integration
  export: {
    permissions: ['showCode'],
    features: ['downloadAsSVG', 'downloadAsReact', 'exportToFigma']
  },
  import: {
    permissions: ['editMode'],
    features: ['importFromFigma']
  },

  // AI Features
  aiCopilot: {
    permissions: ['editMode'],
    features: ['aiCopilot:3', 'aiCopilot:5', 'aiCopilot:15']
  },
  aiChatbot: {
    permissions: ['showContent'],
    features: ['aiChatbot:3', 'aiChatbot:5', 'aiChatbot:15']
  },

  // Advanced Features
  analytics: {
    permissions: ['projectSettings'],
    features: ['analytics', 'crashalytics']
  },
  payment: {
    permissions: ['projectSettings', 'iam'],
    features: ['stripeConnect']
  },
  deployment: {
    permissions: ['projectSettings'],
    features: ['dompilerCloud', 'customDomain']
  },

  // Documentation & Sharing
  docs: {
    permissions: ['showContent'],
    features: ['autoDesignDocs']
  },
  share: {
    permissions: ['inviteMembers'],
    features: ['sharing', 'sharedLibraries']
  }
}

export const ROLE_PERMISSIONS = {
  guest: ['viewPublicProjects'],
  user: ['viewPublicProjects'],
  admin: ['viewPublicProjects', 'governance'],
  superAdmin: [
    'viewPublicProjects',
    'governance',
    'managePlatform'
  ]
}

export const TIER_FEATURES = {
  ready: [
    'editMode',
    'freeDomain',
    'accessToSymbolsLibrary',
    'canvasPages',
    'versionHistory',
    'downloadAsSVG',
    'branching',
    'noWatermark'
  ],
  free: [
    'editMode',
    'freeDomain',
    'accessToSymbolsLibrary',
    'marketplace',
    'downloadAsReact',
    'vscodeSync',
    'chromeExtension',
    'canvasPages',
    'versionHistory',
    'importFromFigma',
    'privateProjects',
    'sharing',
    'aiCopilot:3',
    'aiChatbot:3'
  ],
  pro1: [
    'editMode',
    'freeDomain',
    'accessToSymbolsLibrary',
    'marketplace',
    'downloadAsReact',
    'vscodeSync',
    'chromeExtension',
    'canvasPages',
    'versionHistory',
    'sharedLibraries',
    'downloadAsSVG',
    'customDomain',
    'branching',
    'plugins',
    'autoDesignDocs',
    'importFromFigma',
    'exportToFigma',
    'customBackendIntegration',
    'privateProjects',
    'sharing',
    'inviteMembersIAM',
    'aiCopilot:5',
    'aiChatbot:5'
  ],
  pro2: [
    'editMode',
    'freeDomain',
    'accessToSymbolsLibrary',
    'marketplace',
    'downloadAsReact',
    'vscodeSync',
    'chromeExtension',
    'canvasPages',
    'versionHistory',
    'sharedLibraries',
    'downloadAsSVG',
    'customDomain',
    'branching',
    'plugins',
    'autoDesignDocs',
    'noWatermark',
    'importFromFigma',
    'exportToFigma',
    'customBackendIntegration',
    'integrationsSDK',
    'backendFunctions',
    'privateProjects',
    'sharing',
    'inviteMembersIAM',
    'workspaceAdministration',
    'teamRolesAndPermissions',
    'aiCopilot:15',
    'aiChatbot:15'
  ],
  enterprise: [
    'analytics',
    'crashalytics',
    'projectManagementTools',
    'testingTools',
    'stripeConnect',
    'dompilerCloud'
  ]
}

export const PROJECT_ROLE_PERMISSIONS = {
  unauthenticated: ['platformSettings', 'showContent'],
  guest: ['platformSettings', 'showContent'],
  editor: [
    'platformSettings',
    'showContent',
    'showCode',
    'editMode',
    'versions'
  ],
  admin: [
    'platformSettings',
    'showContent',
    'showCode',
    'editMode',
    'versions',
    'inviteMembers',
    'branchProtection',
    'projectSettings'
  ],
  owner: [
    'platformSettings',
    'showContent',
    'showCode',
    'editMode',
    'versions',
    'inviteMembers',
    'branchProtection',
    'projectSettings',
    'copyPasteAllowanceSetting',
    'iam'
  ]
}
