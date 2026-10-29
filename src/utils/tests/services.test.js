// Drift audit for SERVICE_METHODS — the map in src/utils/services.js
// drives _createServiceProxies (src/index.js L513), which flat-attaches
// every `methodName: serviceName` pair as `sdk.methodName(...)` at boot.
// If a service class grows a public async method that nobody adds to
// the map, sdk.<method> stays undefined and consumers fall through to
// no-op fallbacks silently (closes SDK-SERVICE-METHODS-REGISTRY-DRIFT,
// caught when sdk.getRates was missing from the map for several
// 3.14.x SDK releases despite CreditsService.getRates being public).
//
// Two complementary checks:
//
//   1. UNREGISTERED — service methods not in the map. Many are
//      intentionally not flat-attached (accessed via sdk.execute,
//      sdk.getService(...).x(), or private to the service). Informational
//      by default; run with STRICT_SERVICE_METHODS=1 to hard-fail.
//
//   2. STALE — map entries that don't resolve to a real method. Always
//      hard-fails: every entry creates an `sdk.method` proxy, and a typo
//      in the map turns into a runtime "Method X not found on service Y".

import test from 'tape'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SERVICE_METHODS } from '../services.js'
import * as services from '../../services/index.js'

const STRICT = process.env.STRICT_SERVICE_METHODS === '1'

// The flat proxy resolves sdk.<method> through the REGISTERED service key —
// sdk.getService(key), the name src/index.js passes to _initService — not
// through a naming convention. Many keys do not follow
// Capitalize(key) + 'Service' (shareLinks → ShareLinkService, publicRecords
// → PublicCollectionService, docs → DocService, ...), so the stale check
// reads the registration (key → factory) and the factory → class link from
// the source, the same chain boot walks.
const _source = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const SDK_SOURCE = _source('../../index.js')
const SERVICES_SOURCE = _source('../../services/index.js')
// this._initService('shareLinks', createShareLinkService({ ... }))
const REGISTERED = new Map(
  [...SDK_SOURCE.matchAll(/_initService\(\s*'(\w+)'\s*,\s*(create\w+)\(/g)].map(
    ([, key, factory]) => [key, factory]
  )
)
// export const createShareLinkService = (config) => createService(ShareLinkService, config)
const FACTORY_CLASS = new Map(
  [
    ...SERVICES_SOURCE.matchAll(
      /export const (create\w+)\s*=\s*\(\w*\)\s*=>\s*createService\(\s*(\w+)\s*,/g
    )
  ].map(([, factory, className]) => [factory, className])
)

// Global exemptions — lifecycle hooks that every BaseService-derived class
// inherits. Always counted as private regardless of which class declares them.
const INTENTIONALLY_PRIVATE = new Set([
  'getStatus',
  'destroy',
  'initialize',
  'setConfig',
  'getConfig'
])

// Per-class exemptions — methods that exist on the service for a reason
// OTHER than flat sdk.X(...) access. Verified by walking the codebase:
//
//   CollabService          — session-bound; consumers use
//                            sdk.getService('collab').connect() and then
//                            session-specific calls. See sdk_usage.md.
//
//   DocService             — entity-routed via
//                            sdk.execute('workspaceProject.documents.*', op).
//                            See EntityDispatcher.js L215+.
//
//   TicketService          — entity-routed via
//                            sdk.execute('workspaceProject.tickets', op).
//                            See EntityDispatcher.js L153+.
//
//   ResourceLinkService    — entity-routed via
//                            sdk.execute('workspaceProject.documents.resourceLinks', op).
//
//   WorkspaceProjectService.setRealtimeProvider — internal SDK boot hook,
//                            called by bootShell once at init. Not user-facing.
const INTENTIONALLY_PRIVATE_PER_CLASS = {
  CollabService: new Set([
    'canRedo',
    'canUndo',
    'clearUndoHistory',
    'getConnectionInfo',
    'getRedoStackSize',
    'getUndoStackSize'
  ]),
  DocService: new Set([
    'create',
    'folders',
    'get',
    'list',
    'remove',
    'subscribe',
    'tree',
    'update'
  ]),
  TicketService: new Set([
    'agentQueue',
    'assign',
    'create',
    'epicCounts',
    'get',
    'list',
    'remove',
    'subscribe',
    'tree',
    'update'
  ]),
  ResourceLinkService: new Set(['create', 'list', 'remove', 'removeByPair']),
  WorkspaceProjectService: new Set(['setRealtimeProvider']),
  //   MailService            — entity-routed via
  //                            sdk.execute('mail.setup' | 'mail.accounts' |
  //                            'mail.admin', op) and sdk.getService('mail').
  //                            Flat sdk.listAccounts() / sdk.getSetup() would
  //                            collide with the account/setup vocabulary of
  //                            other surfaces, so mail keeps its namespace.
  MailService: new Set([
    'getSetup',
    'setupLink',
    'setupNotifyAdmin',
    'listAccounts',
    'getAccount',
    'updateAccount',
    'disconnectAccount',
    'adminListAccounts',
    'adminDisconnect',
    'adminAudit'
  ])
}

let BASE_METHODS = new Set()

const _publicMethods = (Class) => {
  const proto = Class.prototype
  if (!proto) return []
  const perClass = INTENTIONALLY_PRIVATE_PER_CLASS[Class.name] || null
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (name === 'constructor') return false
    if (name.startsWith('_')) return false
    if (BASE_METHODS.has(name)) return false
    if (INTENTIONALLY_PRIVATE.has(name)) return false
    if (perClass?.has(name)) return false
    const desc = Object.getOwnPropertyDescriptor(proto, name)
    return typeof desc?.value === 'function'
  })
}

test('SERVICE_METHODS — the registration parse covers every service', (t) => {
  // Guards the stale check below against a vacuous pass: a registration or
  // factory written in a new shape must fail here, not drop out silently.
  const calls = (SDK_SOURCE.match(/this\._initService\(/g) || []).length
  t.ok(REGISTERED.size > 0, `src/index.js registers ${REGISTERED.size} services`)
  t.equal(REGISTERED.size, calls, 'every this._initService(…) call is parsed')
  const unresolved = [...REGISTERED]
    .filter(([, factory]) => typeof services[FACTORY_CLASS.get(factory)] !== 'function')
    .map(([key, factory]) => `${key} → ${factory}`)
  t.deepEqual(unresolved, [], 'every registered factory resolves to an exported class')
  t.end()
})

test('SERVICE_METHODS — stale entries point at a real method on the named service', async (t) => {
  const stale = []
  for (const [method, serviceKey] of Object.entries(SERVICE_METHODS)) {
    const factory = REGISTERED.get(serviceKey)
    if (!factory) {
      stale.push({
        method,
        expectedClass: `'${serviceKey}'`,
        reason: 'service key not registered in src/index.js'
      })
      continue
    }
    const className = FACTORY_CLASS.get(factory) || factory
    const ServiceClass = services[className]
    if (!ServiceClass) {
      stale.push({ method, expectedClass: className, reason: 'class not exported' })
      continue
    }
    const proto = ServiceClass.prototype
    if (typeof proto?.[method] !== 'function') {
      stale.push({ method, expectedClass: className, reason: 'method not on class' })
    }
  }

  if (stale.length) {
    const lines = stale
      .map((s) => `  - ${s.method} → ${s.expectedClass}: ${s.reason}`)
      .join('\n')
    t.fail(`Stale SERVICE_METHODS entries (would throw at sdk.<method>(...) call):\n${lines}`)
  } else {
    t.pass('all map entries resolve to live methods')
  }
  t.end()
})

test('SERVICE_METHODS — drift report (informational unless STRICT_SERVICE_METHODS=1)', async (t) => {
  const { BaseService } = await import('../../services/BaseService.js')
  if (BaseService?.prototype) {
    BASE_METHODS = new Set(
      Object.getOwnPropertyNames(BaseService.prototype).filter(
        (n) => n !== 'constructor'
      )
    )
  }

  const serviceClasses = Object.entries(services).filter(
    ([name, value]) =>
      typeof value === 'function' &&
      name.endsWith('Service') &&
      value.prototype &&
      value !== BaseService
  )

  const missing = []
  for (const [className, ServiceClass] of serviceClasses) {
    const methods = _publicMethods(ServiceClass)
    for (const method of methods) {
      if (!Object.prototype.hasOwnProperty.call(SERVICE_METHODS, method)) {
        missing.push(`${className}.${method}`)
      }
    }
  }

  if (!missing.length) {
    t.pass('every public service method is registered in SERVICE_METHODS')
    t.end()
    return
  }

  t.comment(`${missing.length} public service methods NOT in SERVICE_METHODS:`)
  for (const m of missing) t.comment(`  - ${m}`)
  t.comment('Each may be intentional (accessed via sdk.execute, sdk.getService, etc.) — verify.')
  t.comment('Set STRICT_SERVICE_METHODS=1 to fail this test on any drift.')

  if (STRICT) {
    t.fail(`${missing.length} unregistered methods (strict mode)`)
  } else {
    t.pass(`${missing.length} unregistered methods reported as drift`)
  }
  t.end()
})
