// Abstract project registry. Holds project configs (key + arbitrary
// metadata) and a generic client cache keyed by project. The registry
// itself does not know what a "client" is — it just memoizes whatever
// `buildClient(cfg)` returns. Backend-specific layers (e.g.
// @symbo.ls/sdk-supabase-bridge) supply the buildClient strategy.

export function createRegistry({ projects = {}, defaultKey, buildClient } = {}) {
  if (typeof buildClient !== 'function') {
    throw new Error('createRegistry: buildClient(cfg) function required')
  }

  const _registry = { ...projects }
  const _clients = new Map()

  const getProjectConfig = (key) => _registry[key] || null

  const listConfiguredProjects = () => Object.keys(_registry)

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

  const addProject = (key, cfg) => {
    _registry[key] = cfg
    _clients.delete(key)
  }

  const removeProject = (key) => {
    delete _registry[key]
    _clients.delete(key)
  }

  const reset = () => { _clients.clear() }

  return {
    getClient,
    getClientAsync,
    getProjectConfig,
    listConfiguredProjects,
    forEachClient,
    getDefaultClient,
    addProject,
    removeProject,
    reset,
  }
}
