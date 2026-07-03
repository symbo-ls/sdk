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
