import test from 'tape'
import { createEntityDispatcher, listEntities } from '../../EntityDispatcher.js'
import { RefsService } from '../../RefsService.js'

// Dispatch-layer contract for entity references + workspace search.
//
// Two entity paths, one service: `refs` (resolve / relations) and `search`
// (workspace). They are split because a caller searching does not think of it
// as a "ref" operation, and a declarative
// `fetch: [{ from: 'search', method: 'workspace', params: { query } }]` only
// reads correctly that way.
//
// Beyond the routing, the URL SHAPES are pinned here too. The server's SDK
// route-drift analyzer only sees literal template paths at the `_call` site, so
// a refactor that hoists one into a local `const url` makes the route invisible
// to `bun run check-drift` — these assertions catch that before the analyzer
// silently stops covering the route.

const makeSdk = (calls) => ({
  getService: (name) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string') return undefined
          return (...args) => {
            calls.push({ service: name, method, args })
            return Promise.resolve({ ok: true })
          }
        }
      }
    )
})

test('refs + search are registered entity paths', (t) => {
  const entities = listEntities()
  t.ok(entities.includes('refs'), 'refs is dispatchable')
  t.ok(entities.includes('search'), 'search is dispatchable')
  t.end()
})

test('refs.resolve / refs.relations reach RefsService with the args bag intact', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('refs', 'resolve', { ref: 'ref:doc:66aa' })
  await execute('refs', 'relations', { ref: 'ref:record:vault.items/i-1', depth: 2 })
  t.deepEqual(calls[0], {
    service: 'refs',
    method: 'resolve',
    args: [{ ref: 'ref:doc:66aa' }]
  })
  t.deepEqual(calls[1], {
    service: 'refs',
    method: 'relations',
    args: [{ ref: 'ref:record:vault.items/i-1', depth: 2 }]
  })
  t.end()
})

test('search.workspace maps onto RefsService.searchWorkspace', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('search', 'workspace', { query: 'warranty', surfaces: ['mail'], limit: 5 })
  t.deepEqual(calls[0], {
    service: 'refs',
    method: 'searchWorkspace',
    args: [{ query: 'warranty', surfaces: ['mail'], limit: 5 }]
  })
  t.end()
})

test('an unsupported op names the ops that ARE supported', async (t) => {
  const execute = createEntityDispatcher(makeSdk([]))
  try {
    await execute('refs', 'create', {})
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/does not support op 'create'/.test(err.message), 'the refusal names the op')
    t.ok(/resolve, relations/.test(err.message), 'and lists the real ops')
  }
  t.end()
})

// ── URL shapes ──────────────────────────────────────────────────────────────

const makeRefsService = () => {
  const svc = new RefsService()
  const calls = []
  svc._call = (methodName, endpoint, opts) => {
    calls.push({ methodName, endpoint, opts })
    return Promise.resolve({})
  }
  svc._resolveWorkspaceId = (explicit) => explicit || 'ws-1'
  return { svc, calls }
}

test('resolve builds GET /workspaces/:id/refs/resolve?ref= with the ref encoded', async (t) => {
  const { svc, calls } = makeRefsService()
  await svc.resolve({ ref: 'ref:record:vault.items/i-1' })
  t.equal(calls[0].methodName, 'refs.resolve')
  t.equal(
    calls[0].endpoint,
    '/workspaces/ws-1/refs/resolve?ref=ref%3Arecord%3Avault.items%2Fi-1',
    'the ref is URI-encoded — a record ref carries a slash and a mail ref a hash'
  )
  t.end()
})

test('relations builds GET /workspaces/:id/refs/relations?ref=&depth= and clamps depth', async (t) => {
  const { svc, calls } = makeRefsService()
  await svc.relations({ ref: 'ref:mail:6a9d#6a9e' })
  await svc.relations({ ref: 'ref:doc:66aa', depth: 9 })
  t.equal(
    calls[0].endpoint,
    '/workspaces/ws-1/refs/relations?ref=ref%3Amail%3A6a9d%236a9e&depth=1',
    'default depth 1, hash encoded'
  )
  t.equal(calls[1].endpoint, '/workspaces/ws-1/refs/relations?ref=ref%3Adoc%3A66aa&depth=2', 'depth clamps to 2')
  t.end()
})

test('searchWorkspace builds GET /workspaces/:id/search with q, surfaces and limit', async (t) => {
  const { svc, calls } = makeRefsService()
  await svc.searchWorkspace({ query: 'warranty cap', surfaces: ['mail', 'records'], limit: 5 })
  await svc.searchWorkspace({ q: 'x' })
  t.equal(
    calls[0].endpoint,
    '/workspaces/ws-1/search?q=warranty+cap&surfaces=mail%2Crecords&limit=5'
  )
  t.equal(calls[1].endpoint, '/workspaces/ws-1/search?q=x', '`q` is accepted as an alias for `query`')
  t.end()
})

test('every method refuses without a workspace rather than calling an unscoped URL', async (t) => {
  const svc = new RefsService()
  svc._resolveWorkspaceId = () => undefined
  svc._call = () => t.fail('must not reach the wire')
  t.throws(() => svc.resolve({ ref: 'ref:doc:1' }), /requires a workspaceId/)
  t.throws(() => svc.relations({ ref: 'ref:doc:1' }), /requires a workspaceId/)
  t.throws(() => svc.searchWorkspace({ query: 'x' }), /requires a workspaceId/)
  t.throws(() => svc.resolve({}), /requires a ref/)
  t.throws(() => svc.relations({}), /requires a ref/)
  t.end()
})
