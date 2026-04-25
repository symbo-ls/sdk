import { createSupabaseClient } from './client.js'

// createFederation({ projects, defaultKey })
//
// projects: { [key]: { key, url, anonKey, anonJwt, ... } }
// defaultKey: project key returned by getDefaultClient(); used as the
//             primary project for getSupabase()-style legacy callers.
//
// Returns:
//   getClient(key)            → cached Supabase client for that project
//   getClientAsync(key)       → same, async-friendly
//   getProjectConfig(key)     → raw config object
//   listConfiguredProjects()  → string[] of project keys present
//   forEachClient(fn)         → fn(client, key) for every configured project
//   getDefaultClient()        → getClient(defaultKey)
//   reset()                   → drops cache (tests only)
export function createFederation({ projects = {}, defaultKey } = {}) {
  const _registry = { ...projects }
  const _clients = new Map()

  const getProjectConfig = (key) => _registry[key] || null

  const listConfiguredProjects = () => Object.keys(_registry)

  const buildClient = (cfg) => createSupabaseClient(cfg)

  const getClient = (key = defaultKey) => {
    if (!key) return null
    if (_clients.has(key)) return _clients.get(key)
    const cfg = _registry[key]
    if (!cfg) return null
    const client = buildClient(cfg)
    _clients.set(key, client)
    return client
  }

  const getClientAsync = async (key) => getClient(key)

  const forEachClient = (fn) => {
    for (const key of listConfiguredProjects()) {
      const client = getClient(key)
      if (client) fn(client, key)
    }
  }

  const getDefaultClient = () => getClient(defaultKey)

  const reset = () => {
    _clients.clear()
  }

  const addProject = (key, cfg) => {
    _registry[key] = cfg
    _clients.delete(key)
  }

  return {
    getClient,
    getClientAsync,
    getProjectConfig,
    listConfiguredProjects,
    forEachClient,
    getDefaultClient,
    addProject,
    reset,
  }
}
