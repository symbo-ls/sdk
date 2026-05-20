// @symbo.ls/sdk-financials — entry point.
//
// Exposes:
//   FinancialsService              — class extending BaseService
//   createFinancialsService(cfg)   — factory
//   registerFinancials(sdk)        — wires the service into a live SDK
//                                     instance + registers the four
//                                     financials.* entity routes for
//                                     sdk.execute / DOMQL fetch: descriptors

import { registerEntity } from '@symbo.ls/sdk'
import { FinancialsService, createFinancialsService } from './FinancialsService.js'

// Argument adapters mirror the core EntityDispatcher conventions
// (filter/payload/id). Kept local to the extension so the core SDK
// stays free of financials-specific routing.
const _payload = (a) => [a?.payload ?? a?.data ?? a]
const _id = (a) => [a?.id ?? a?.userId ?? a]
const _listFilter = (a) => [{
  userId: a?.userId ?? a?.filter?.userId,
  workspaceId: a?.workspaceId ?? a?.filter?.workspaceId,
}]

export function registerFinancials (sdk) {
  if (!sdk || typeof sdk._initService !== 'function') {
    throw new Error('[sdk-financials] registerFinancials: pass a live SDK instance')
  }

  // 1) Register the service so sdk.getService('financials') returns it.
  const svc = createFinancialsService({
    context: sdk._context,
    options: sdk._options,
  })
  sdk._initService('financials', svc)

  // 2) Register the four dispatcher routes for sdk.execute / fetch: descriptors.
  registerEntity('financials.equityGrants', {
    service: 'financials',
    methods: { list: 'equityGrants.list', upsert: 'equityGrants.upsert' },
    argMap: { list: _listFilter, upsert: _payload },
  })
  registerEntity('financials.compensation', {
    service: 'financials',
    methods: { list: 'compensation.list', upsert: 'compensation.upsert' },
    argMap: { list: _listFilter, upsert: _payload },
  })
  registerEntity('financials.investorProfiles', {
    service: 'financials',
    methods: { get: 'investorProfiles.get', upsert: 'investorProfiles.upsert' },
    argMap: { get: _id, upsert: _payload },
  })
  registerEntity('financials.valuations', {
    service: 'financials',
    methods: { list: 'valuations.list', create: 'valuations.create' },
    argMap: {
      list: (a) => [{ workspaceId: a?.workspaceId ?? a?.filter?.workspaceId }],
      create: _payload,
    },
  })
}

export { FinancialsService, createFinancialsService }
