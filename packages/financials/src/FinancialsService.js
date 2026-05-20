import { BaseService } from '@symbo.ls/sdk'

// FinancialsService — opt-in per-tenant extension to @symbo.ls/sdk.
//
// This package is NOT part of the SDK core bundle. Consumers that need
// financials explicitly opt in:
//
//   import { registerFinancials, FinancialsService } from '@symbo.ls/sdk-financials'
//   import { getSDK } from '…'
//   registerFinancials(getSDK())
//   // now: sdk.execute('financials.equityGrants', 'list', {workspaceId})
//   //      sdk.getService('financials').equityGrants.list({workspaceId})
//
// Backs /core/financials/* on the main API server. The actual data lives
// in the financials Supabase project (bxhdvzwmvptgksqfkgqp), gated by
// Organization.enabledExtensions['financials']. Three failure modes:
//
//   extension_not_enabled     (403)  — caller's org hasn't installed financials
//   extension_not_configured  (503)  — operator hasn't provisioned the Supabase project
//   plain HTTP errors                — bubble through as { status, error, message }
export class FinancialsService extends BaseService {
  equityGrants = {
    list: ({ userId, workspaceId } = {}) => {
      const qs = new URLSearchParams()
      if (userId) qs.set('userId', userId)
      if (workspaceId) qs.set('workspaceId', workspaceId)
      const s = qs.toString()
      return this._call('financials.equityGrants.list', `/financials/equity-grants${s ? '?' + s : ''}`)
    },
    upsert: (payload) =>
      this._call('financials.equityGrants.upsert', '/financials/equity-grants', {
        method: 'POST',
        body: { payload }
      })
  }

  compensation = {
    list: ({ userId, workspaceId } = {}) => {
      const qs = new URLSearchParams()
      if (userId) qs.set('userId', userId)
      if (workspaceId) qs.set('workspaceId', workspaceId)
      const s = qs.toString()
      return this._call('financials.compensation.list', `/financials/compensation${s ? '?' + s : ''}`)
    },
    upsert: (payload) =>
      this._call('financials.compensation.upsert', '/financials/compensation', {
        method: 'POST',
        body: { payload }
      })
  }

  investorProfiles = {
    get: (userId) =>
      this._call('financials.investorProfiles.get', `/financials/investor-profiles/${encodeURIComponent(userId)}`),
    upsert: (payload) =>
      this._call('financials.investorProfiles.upsert', '/financials/investor-profiles', {
        method: 'POST',
        body: { payload }
      })
  }

  valuations = {
    list: ({ workspaceId } = {}) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
      return this._call('financials.valuations.list', `/financials/valuations${qs}`)
    },
    create: (payload) =>
      this._call('financials.valuations.create', '/financials/valuations', {
        method: 'POST',
        body: { payload }
      })
  }
}

export const createFinancialsService = (config) => new FinancialsService(config)
