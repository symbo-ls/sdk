import test from 'tape'
import { readFileSync } from 'node:fs'
import { SDK } from '../../../sdk.js'
import * as fullEntry from '../../../index.js'
import * as lazyEntry from '../../../lazy.js'
import * as services from '../../index.js'
import { BaseService } from '../../BaseService.js'
import {
  SERVICE_REGISTRY,
  SERVICE_NAMES,
  CORE_SERVICE_NAMES,
  SYNC_HANDLE_METHODS
} from '../../registry.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { registerEntity, createEntityDispatcher } from '../../EntityDispatcher.js'

// "Load a service on its first call" (`lazyServices: true`, src/sdk.js +
// services/registry.js). Offline: the fakes below never reach the network.

const API = 'http://localhost:0/api'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const isThenable = (v) => Boolean(v) && typeof v.then === 'function'

class FakeProject extends BaseService {
  async getProjects () {
    return { workspace: this._context.activeWorkspaceId ?? null, svc: this }
  }
}

// init() waits on a gate, so a test can update the context while the
// service is built but not registered yet.
class SlowInitProject extends FakeProject {
  async init (args) {
    super.init(args)
    await SlowInitProject.gate
  }
}

class FakeBuilds extends BaseService {
  constructor (config) {
    super(config)
    this.started = 0
    this.stopped = 0
  }

  subscribeWorkspaceBuilds () {
    this.started++
    return () => {
      this.stopped++
    }
  }
}

// A registry entry that counts its loads, can wait on a gate, and can fail.
const controllable = (ServiceClass) => {
  const ctl = { calls: 0, failNext: 0, gate: null }
  ctl.entry = Object.freeze({
    className: ServiceClass.name,
    load: async () => {
      ctl.calls++
      if (ctl.gate) await ctl.gate
      if (ctl.failNext > 0) {
        ctl.failNext--
        throw new Error('chunk 404')
      }
      return ServiceClass
    }
  })
  return ctl
}

const gate = () => {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const lazySdk = (overrides = {}, options = {}) =>
  new SDK({
    apiUrl: API,
    lazyServices: true,
    ...options,
    serviceRegistry: { ...SERVICE_REGISTRY, ...overrides }
  })

test('registry: every service of the old initialize(), in its order, each loading the class services/index.js exports', async (t) => {
  t.equal(SERVICE_NAMES.length, 78, '78 services, as initialize() always built')
  t.deepEqual(SERVICE_NAMES.slice(0, 3), ['auth', 'collab', 'project'], 'build order kept')
  t.equal(SERVICE_NAMES[SERVICE_NAMES.length - 1], 'persona', 'persona still last')
  for (const name of SERVICE_NAMES) {
    const entry = SERVICE_REGISTRY[name]
    const ServiceClass = await entry.load()
    t.equal(ServiceClass, services[entry.className], `${name} → ${entry.className}`)
  }
  t.end()
})

test('lazy mode: initialize() builds only the core services', async (t) => {
  const sdk = lazySdk()
  await sdk.initialize({})
  t.deepEqual(
    [...sdk._services.keys()].sort(),
    [...CORE_SERVICE_NAMES].sort(),
    `only the ${CORE_SERVICE_NAMES.length} core services`
  )
  t.notOk(sdk._services.has('tickets'), 'tickets not built')
  t.ok(sdk.isReady(), 'isReady() over the built services')
  t.ok(sdk._tokenManager, 'root TokenManager adopted')
  t.end()
})

test('lazy mode: preloadServices are built by initialize() and read synchronously after it', async (t) => {
  const sdk = lazySdk({}, { preloadServices: ['tickets'] })
  await sdk.initialize({})
  const tickets = sdk.getService('tickets')
  t.notOk(isThenable(tickets), 'getService answers the instance, not a Promise')
  t.ok(tickets instanceof services.TicketService, 'a TicketService')
  t.end()
})

test('default mode is unchanged: initialize() builds every service; getService is synchronous', async (t) => {
  const sdk = new SDK({ apiUrl: API })
  await sdk.initialize({})
  t.equal(sdk._services.size, SERVICE_NAMES.length, 'all 78 built')
  const tickets = sdk.getService('tickets')
  t.notOk(isThenable(tickets), 'getService answers the instance')
  t.ok(tickets instanceof services.TicketService, 'a TicketService')
  t.throws(() => sdk.getService('nope'), /Service 'nope' not found/, 'unknown name still throws')
  t.end()
})

test('first call loads the service once; concurrent first calls share one load', async (t) => {
  const ctl = controllable(FakeProject)
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({})
  t.equal(ctl.calls, 0, 'initialize() did not load it')

  const [a, b, viaGet, viaLoad] = await Promise.all([
    sdk.getProjects(),
    sdk.getProjects(),
    sdk.getService('project'),
    sdk.loadService('project')
  ])
  t.equal(ctl.calls, 1, 'one load for four concurrent first calls')
  t.equal(a.svc, b.svc, 'one instance')
  t.equal(viaGet, a.svc, 'getService resolved to it')
  t.equal(viaLoad, a.svc, 'loadService resolved to it')
  t.equal(sdk.getService('project'), a.svc, 'getService is synchronous once loaded')
  await sdk.getProjects()
  t.equal(ctl.calls, 1, 'later calls do not load again')
  t.end()
})

test('a lazy service gets the eager context, and updates made before and during its build', async (t) => {
  const ctl = controllable(SlowInitProject)
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({ activeOrgId: 'org-1' })
  sdk.updateContext({ activeWorkspaceId: 'ws-before' })

  const initGate = gate()
  SlowInitProject.gate = initGate.promise
  const pending = sdk.loadService('project')
  await tick()
  await tick()
  // Built (init is waiting) but not registered: updateContext() cannot
  // reach it through the loaded-services walk.
  t.notOk(sdk._services.has('project'), 'not registered yet')
  sdk.updateContext({ activeWorkspaceId: 'ws-during' })
  initGate.release()
  const svc = await pending
  SlowInitProject.gate = null

  t.equal(svc._context.activeWorkspaceId, 'ws-during', 'update made during the build is applied')
  t.equal(svc._context.activeOrgId, 'org-1', 'initialize() context is there')
  t.equal(svc._apiUrl, API, 'same apiUrl as the eager services')
  t.equal(svc._tokenManager, sdk._tokenManager, 'same TokenManager singleton')
  t.equal(svc._context.services.auth, sdk.getService('auth'), 'sees its siblings')
  t.end()
})

test('a failed chunk load rejects with SDK_SERVICE_LOAD_FAILED; the next call loads again', async (t) => {
  const ctl = controllable(FakeProject)
  ctl.failNext = 1
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({})

  const results = await Promise.allSettled([sdk.getProjects(), sdk.loadService('project')])
  t.equal(ctl.calls, 1, 'concurrent calls shared the one failed load')
  for (const r of results) {
    t.equal(r.status, 'rejected', 'the call rejects (no throw, no hang)')
    t.equal(r.reason?.code, 'SDK_SERVICE_LOAD_FAILED', 'code')
    t.equal(r.reason?.service, 'project', 'names the service')
    t.match(r.reason?.message, /Service 'project' failed to load: chunk 404/, 'clear message')
    t.equal(r.reason?.cause?.message, 'chunk 404', 'keeps the bundler error as cause')
  }
  t.notOk(sdk._services.has('project'), 'nothing registered')
  t.notOk(sdk._loading.has('project'), 'no poisoned cache')

  const res = await sdk.getProjects()
  t.ok(res.svc instanceof FakeProject, 'the next call loads and answers')
  t.equal(ctl.calls, 2, 'it loaded again')
  t.end()
})

test('loadService before initialize() rejects; an unknown name rejects', async (t) => {
  const sdk = lazySdk()
  const early = await sdk.loadService('tickets').catch((e) => e)
  t.equal(early.code, 'SDK_NOT_INITIALIZED', 'not initialized')
  t.throws(() => sdk.getService('tickets'), /Service 'tickets' not found/, 'getService before init throws, as always')
  await sdk.initialize({})
  const unknown = await sdk.loadService('nope').catch((e) => e)
  t.equal(unknown.code, 'SDK_SERVICE_UNKNOWN', 'unknown name')
  t.end()
})

test('sync members answer synchronously before any lazy service loads', async (t) => {
  const sdk = lazySdk()
  await sdk.initialize({})
  const before = sdk._services.size

  t.notOk(isThenable(sdk.getAuthToken()), 'getAuthToken')
  t.equal(typeof sdk.hasPermission('read'), 'boolean', 'hasPermission')
  t.equal(typeof sdk.isConnected(), 'boolean', 'isConnected')
  t.equal(typeof sdk.getFileUrl('f1'), 'string', 'getFileUrl')
  t.notOk(isThenable(sdk.validateDomain('example.com')), 'validateDomain')
  t.notOk(isThenable(sdk.validateBranchName('main')), 'validateBranchName')
  t.equal(typeof sdk.shareUrl('tok', 'https://x.test'), 'string', 'shareUrl')
  const off = sdk.onAuthStateChange(() => {})
  t.equal(typeof off, 'function', 'onAuthStateChange answers its stop function')
  off()
  t.equal(sdk._services.size, before, 'no lazy service was loaded by any of them')
  t.end()
})

// Drift guard: a NON-core service whose flat method answers a synchronous
// value would change nature when it goes lazy. Each such method must be
// `async`, a SYNC_HANDLE_METHODS member, or `return this.<helper>(…)` — the
// promise-returning request helpers (_call, _request, _ws, …). Source read,
// so it is a heuristic: a new case that fails here decides between "make
// the service core" and "add the method to SYNC_HANDLE_METHODS".
test('every flat method of a lazy service answers a Promise or a stop handle', (t) => {
  const offenders = []
  for (const [method, serviceName] of Object.entries(SERVICE_METHODS)) {
    const entry = SERVICE_REGISTRY[serviceName]
    if (!entry || entry.core) continue
    const source = readFileSync(new URL(`../../${entry.className}.js`, import.meta.url), 'utf8')
    const decl = new RegExp(`^  (async )?${method} ?\\(`, 'm').exec(source)
    if (!decl) {
      offenders.push(`${serviceName}.${method}: declaration not found`)
      continue
    }
    if (decl[1] || SYNC_HANDLE_METHODS.has(method)) continue
    const body = source.slice(decl.index, decl.index + 4000)
    const firstReturn = /\n\s+return\s+([^\n]*)/.exec(body)?.[1] || ''
    if (!/^this\.[_A-Za-z]\w*\(/.test(firstReturn)) {
      offenders.push(`${serviceName}.${method}: first return is \`${firstReturn.slice(0, 60)}\``)
    }
  }
  t.deepEqual(offenders, [], 'no synchronous value behind a lazy proxy')
  for (const method of SYNC_HANDLE_METHODS) {
    const serviceName = SERVICE_METHODS[method]
    t.ok(serviceName && !SERVICE_REGISTRY[serviceName]?.core, `${method} belongs to a lazy service`)
  }
  t.end()
})

test('a subscribe-style proxy on a lazy service answers its stop handle at once', async (t) => {
  const ctl = controllable(FakeBuilds)
  const sdk = lazySdk({ builds: ctl.entry })
  await sdk.initialize({})
  const stop = sdk.subscribeWorkspaceBuilds({ onBuildStatus () {} })
  t.equal(typeof stop, 'function', 'a function, synchronously, before the load')
  const svc = await sdk.loadService('builds')
  await tick()
  t.equal(svc.started, 1, 'the real subscribe ran after the load')
  stop()
  t.equal(svc.stopped, 1, 'the handle stops the real subscription')

  // Stopped before the service arrives: the subscription is ended at once.
  const ctl2 = controllable(FakeBuilds)
  const loadGate = gate()
  ctl2.gate = loadGate.promise
  const sdk2 = lazySdk({ builds: ctl2.entry })
  await sdk2.initialize({})
  const early = sdk2.subscribeWorkspaceBuilds({ onBuildStatus () {} })
  early()
  loadGate.release()
  const svc2 = await sdk2.loadService('builds')
  await tick()
  t.equal(svc2.started, 1, 'it started')
  t.equal(svc2.stopped, 1, 'and was stopped right away')
  t.end()
})

test('execute() on a lazy entity loads its service and answers a Promise', async (t) => {
  registerEntity('test.lazyProject', { service: 'project', methods: { list: 'getProjects' } })
  registerEntity('test.lazyMissing', { service: 'project', methods: { list: 'nope' } })

  const missing = lazySdk({ project: controllable(FakeProject).entry })
  await missing.initialize({})
  const err = await missing.execute('test.lazyMissing', 'list', {}).catch((e) => e)
  t.match(err.message, /Method 'nope' not found/, 'a missing method is a rejection before the load')

  const ctl = controllable(FakeProject)
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({})
  const pending = sdk.execute('test.lazyProject', 'list', {})
  t.ok(isThenable(pending), 'a Promise while the service loads')
  const res = await pending
  t.ok(res.svc instanceof FakeProject, 'answered by the loaded service')
  t.throws(() => sdk.execute('test.nope', 'list'), /Unknown entity/, 'an unknown entity still throws synchronously')
  t.throws(() => sdk.execute('test.lazyMissing', 'list', {}), /Method 'nope' not found/, 'once loaded, the old synchronous path')
  t.end()
})

test('execute(): a loaded service with its own `then` key is called, not awaited', (t) => {
  // Regression: a `typeof service.then === 'function'` duck-type took a
  // catch-all Proxy service (registry route tests use one) for a pending
  // load and called `then(invoke)` on it. Only a native Promise is a load.
  registerEntity('test.thenKey', { service: 'thenKey', methods: { list: 'listAll' } })
  const calls = []
  const svc = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return 'sync' } })
  const dispatch = createEntityDispatcher({ getService: (n) => (n === 'thenKey' ? svc : null) })
  t.equal(dispatch('test.thenKey', 'list', { a: 1 }), 'sync', 'answered synchronously')
  t.deepEqual(calls, [['listAll', { a: 1 }]], 'the mapped method ran once, never `then`')
  t.end()
})

test('BaseService._sibling loads a sibling that is not loaded yet', async (t) => {
  const ctl = controllable(FakeProject)
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({})
  const file = sdk.getService('file')
  const project = await file._sibling('project')
  t.ok(project instanceof FakeProject, 'loaded on demand')
  t.equal(await file._sibling('nope'), undefined, 'an unknown name is undefined')
  const bare = new BaseService({ context: { services: {} } })
  t.equal(await bare._sibling('project'), undefined, 'outside an SDK: undefined, as before')
  t.end()
})

test('lazy entry: every export of the main entry except the createXService factories', (t) => {
  const full = Object.keys(fullEntry).sort()
  const lazy = Object.keys(lazyEntry).sort()
  const onlyFull = full.filter((k) => !lazy.includes(k))
  t.deepEqual(lazy.filter((k) => !full.includes(k)), [], 'nothing extra in the lazy entry')
  t.ok(onlyFull.length === 74 && onlyFull.every((k) => /^create\w+Service$/.test(k)), 'the difference is the 74 factories')
  t.equal(lazyEntry.default, SDK, 'default export is the SDK class')
  t.equal(fullEntry.default, SDK, 'same class in the main entry')
  t.end()
})

// Last: destroy() clears the shared state the tests above used.
test('destroy() during a load: the late service is not registered', async (t) => {
  const ctl = controllable(FakeProject)
  const loadGate = gate()
  ctl.gate = loadGate.promise
  const sdk = lazySdk({ project: ctl.entry })
  await sdk.initialize({})
  const pending = sdk.loadService('project')
  await sdk.destroy()
  loadGate.release()
  const err = await pending.catch((e) => e)
  t.equal(err.code, 'SDK_DESTROYED', 'the load rejects')
  t.notOk(sdk._services.has('project'), 'not registered')
  t.throws(() => sdk.getService('project'), /not found/, 'getService after destroy throws, as before')
  t.end()
})
