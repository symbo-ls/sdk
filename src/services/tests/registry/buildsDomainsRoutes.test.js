import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the /infra control-plane routes: builds.*
// (BuildsService) and projectDomains (DnsService, server PR #440). Verifies
// arg threading for BOTH caller shapes — imperative ({ workspaceId, ... })
// and the declarative fetch-adapter pack ({ filter, params, ... }).

const makeSdk = (calls) => ({
  getService: (name) => new Proxy({}, {
    get: (_t, method) => {
      if (typeof method !== 'string') return undefined
      return (...args) => {
        calls.push({ service: name, method, args })
        return Promise.resolve({ ok: true })
      }
    }
  })
})

test('builds.* routes thread workspaceId positionally (imperative shape)', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('builds.repos', 'list', { workspaceId: 'ws1' })
  await execute('builds.imports', 'create', {
    workspaceId: 'ws1',
    payload: { repositoryFullName: 'acme/web' }
  })
  await execute('builds.builds', 'create', {
    workspaceId: 'ws1',
    repoId: 'repo9',
    payload: { branch: 'main' }
  })
  await execute('builds.deployments', 'create', {
    workspaceId: 'ws1',
    buildId: 'b7',
    payload: { region: 'europe-west1' }
  })
  await execute('builds.github', 'state', { workspaceId: 'ws1' })

  t.deepEqual(calls[0], { service: 'builds', method: 'listBuildRepos', args: ['ws1'] })
  t.deepEqual(calls[1], {
    service: 'builds',
    method: 'createBuildImport',
    args: ['ws1', { repositoryFullName: 'acme/web' }]
  })
  t.deepEqual(calls[2], {
    service: 'builds',
    method: 'triggerBuild',
    args: ['ws1', 'repo9', { branch: 'main' }]
  })
  t.deepEqual(calls[3], {
    service: 'builds',
    method: 'deployBuild',
    args: ['ws1', 'b7', { region: 'europe-west1' }]
  })
  t.deepEqual(calls[4], { service: 'builds', method: 'getBuildsGitHubState', args: ['ws1'] })
  t.end()
})

test('builds.* routes accept the declarative fetch-adapter pack ({ params })', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('builds.imports', 'list', { filter: undefined, params: { workspaceId: 'ws2' } })
  await execute('builds.deployments', 'list', { params: { workspaceId: 'ws2' } })

  t.deepEqual(calls[0], { service: 'builds', method: 'listBuildImports', args: ['ws2'] })
  t.deepEqual(calls[1], { service: 'builds', method: 'listBuildDeployments', args: ['ws2'] })
  t.end()
})

test('builds.* control-plane verbs — import update/remove, rollback, scale, logs', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('builds.imports', 'update', {
    workspaceId: 'ws1',
    repoId: 'repo9',
    payload: { envVars: { NODE_ENV: 'production' }, defaultBranch: 'main' }
  })
  await execute('builds.imports', 'remove', { workspaceId: 'ws1', repoId: 'repo9' })
  await execute('builds.deployments', 'rollback', { workspaceId: 'ws1', deploymentId: 'd3' })
  await execute('builds.deployments', 'scale', {
    workspaceId: 'ws1',
    deploymentId: 'd3',
    payload: { minInstances: 0, maxInstances: 3, cpu: '1', memory: '512Mi' }
  })
  await execute('builds.builds', 'logs', { workspaceId: 'ws1', buildId: 'b7', tailBytes: 65536 })
  // Fetch-adapter pack shape ({ params }) for the row-id resolvers.
  await execute('builds.imports', 'remove', { params: { workspaceId: 'ws2', repoId: 'repoP' } })

  t.deepEqual(calls[0], {
    service: 'builds',
    method: 'updateBuildImport',
    args: ['ws1', 'repo9', { envVars: { NODE_ENV: 'production' }, defaultBranch: 'main' }]
  })
  t.deepEqual(calls[1], { service: 'builds', method: 'deleteBuildImport', args: ['ws1', 'repo9'] })
  t.deepEqual(calls[2], { service: 'builds', method: 'rollbackDeployment', args: ['ws1', 'd3'] })
  t.deepEqual(calls[3], {
    service: 'builds',
    method: 'scaleDeployment',
    args: ['ws1', 'd3', { minInstances: 0, maxInstances: 3, cpu: '1', memory: '512Mi' }]
  })
  t.deepEqual(calls[4], {
    service: 'builds',
    method: 'getBuildLogs',
    args: ['ws1', 'b7', { tailBytes: 65536 }]
  })
  t.deepEqual(calls[5], { service: 'builds', method: 'deleteBuildImport', args: ['ws2', 'repoP'] })
  t.end()
})

test('builds subscribe routes pass the handlers bag through to subscribeWorkspaceBuilds', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  const bag = { workspaceId: 'ws1', onBuildStatus: () => {}, onDeploymentStatus: () => {} }
  await execute('builds.builds', 'subscribe', bag)
  await execute('builds.deployments', 'subscribe', bag)

  t.equal(calls[0].method, 'subscribeWorkspaceBuilds', 'builds.builds subscribe → subscribeWorkspaceBuilds')
  t.equal(calls[0].args.length, 1, 'single positional arg')
  t.equal(calls[0].args[0], bag, 'handlers bag passes through untouched')
  t.equal(calls[1].method, 'subscribeWorkspaceBuilds', 'builds.deployments subscribe → subscribeWorkspaceBuilds')
  t.equal(calls[1].args[0], bag, 'same bag threading for the deployments entity')
  t.end()
})

test('projectDomains routes map the PR #440 lifecycle onto DnsService', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('projectDomains', 'list', { projectId: 'p1' })
  await execute('projectDomains', 'check', { projectId: 'p1', domain: 'www.example.com' })
  await execute('projectDomains', 'add', {
    projectId: 'p1',
    customDomains: 'www.example.com',
    envKey: 'production'
  })
  await execute('projectDomains', 'status', { projectId: 'p1', hostname: 'www.example.com' })
  await execute('projectDomains', 'instructions', { projectId: 'p1', domain: 'www.example.com' })
  await execute('projectDomains', 'remove', { projectId: 'p1', domain: 'www.example.com' })

  t.deepEqual(calls[0], { service: 'dns', method: 'getProjectDomains', args: ['p1'] })
  t.deepEqual(calls[1], {
    service: 'dns',
    method: 'checkProjectDomain',
    args: ['p1', 'www.example.com']
  })
  t.deepEqual(calls[2], {
    service: 'dns',
    method: 'addProjectCustomDomains',
    args: ['p1', 'www.example.com', { envKey: 'production' }]
  })
  t.deepEqual(calls[3], {
    service: 'dns',
    method: 'getProjectCustomDomainStatus',
    args: ['p1', 'www.example.com']
  })
  t.deepEqual(calls[4], {
    service: 'dns',
    method: 'getProjectDomainInstructions',
    args: ['p1', 'www.example.com']
  })
  t.deepEqual(calls[5], {
    service: 'dns',
    method: 'removeProjectCustomDomain',
    args: ['p1', 'www.example.com']
  })
  t.end()
})
