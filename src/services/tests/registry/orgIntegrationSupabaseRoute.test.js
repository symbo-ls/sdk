import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for the generic external-Supabase data plane:
// 'orgIntegration.supabase' → IntegrationService.supabaseProjectCall →
// POST /org-integrations/:idOrSlug/call. Verifies the op is injected from
// the dispatcher verb, slug/idOrSlug/id resolve the integration row, and
// both caller shapes work — imperative ({ slug, table, ... }) and the
// declarative fetch-adapter pack ({ params }).

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

test('orgIntegration.supabase select threads the full imperative bag (slug → idOrSlug)', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'select', {
    slug: 'acme',
    table: 'listings',
    filter: { status: 'active' },
    order: { column: 'created_at', ascending: false },
    limit: 50
  })

  t.deepEqual(calls[0], {
    service: 'integration',
    method: 'supabaseProjectCall',
    args: [{
      idOrSlug: 'acme',
      op: 'select',
      table: 'listings',
      filter: { status: 'active' },
      order: { column: 'created_at', ascending: false },
      limit: 50,
      values: undefined
    }]
  })
  t.end()
})

test('orgIntegration.supabase write verbs map op names onto the wire (insert/update/delete)', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'insert', {
    slug: 'acme',
    table: 'transactions',
    values: { amount: 100 }
  })
  await execute('orgIntegration.supabase', 'update', {
    slug: 'acme',
    table: 'profiles',
    filter: { id: 'u1' },
    values: { role: 'agent' }
  })
  await execute('orgIntegration.supabase', 'delete', {
    slug: 'acme',
    table: 'listings',
    filter: { id: 'l9' }
  })

  t.equal(calls[0].args[0].op, 'insert', 'insert verb → op insert')
  t.deepEqual(calls[0].args[0].values, { amount: 100 }, 'insert values pass through')
  t.equal(calls[1].args[0].op, 'update', 'update verb → op update')
  t.deepEqual(calls[1].args[0].filter, { id: 'u1' }, 'update filter passes through')
  t.equal(calls[2].args[0].op, 'delete', 'delete verb → op delete')
  t.equal(calls[2].args[0].table, 'listings', 'delete table passes through')
  t.end()
})

test('orgIntegration.supabase remove aliases the delete op (standard CRUD vocabulary)', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'remove', {
    slug: 'acme',
    table: 'chatbot_knowledge',
    filter: { id: 'k3' }
  })

  t.equal(calls[0].method, 'supabaseProjectCall', 'routes to supabaseProjectCall')
  t.equal(calls[0].args[0].op, 'delete', 'remove verb → op delete on the wire')
  t.end()
})

test('orgIntegration.supabase introspect needs only the integration reference', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'introspect', { slug: 'acme' })

  const bag = calls[0].args[0]
  t.equal(bag.idOrSlug, 'acme', 'slug resolves the integration row')
  t.equal(bag.op, 'introspect', 'introspect verb → op introspect')
  t.equal(bag.table, undefined, 'no table for introspect')
  t.equal(bag.filter, undefined, 'no filter for introspect')
  t.end()
})

test('orgIntegration.supabase accepts idOrSlug/id spellings and the fetch-adapter pack ({ params })', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'select', {
    idOrSlug: '665f00aa11bb22cc33dd44ee',
    table: 'bookings'
  })
  await execute('orgIntegration.supabase', 'select', {
    id: '665f00aa11bb22cc33dd44ee',
    table: 'bookings'
  })
  await execute('orgIntegration.supabase', 'select', {
    params: { slug: 'acme', table: 'listing_analytics', limit: 10 }
  })

  t.equal(calls[0].args[0].idOrSlug, '665f00aa11bb22cc33dd44ee', 'idOrSlug passes through')
  t.equal(calls[1].args[0].idOrSlug, '665f00aa11bb22cc33dd44ee', 'bare id resolves too')
  t.equal(calls[2].args[0].idOrSlug, 'acme', 'params pack: slug resolves')
  t.equal(calls[2].args[0].table, 'listing_analytics', 'params pack: table resolves')
  t.equal(calls[2].args[0].limit, 10, 'params pack: limit resolves')
  t.end()
})

test('orgIntegration.supabase op comes from the dispatcher verb — a caller-supplied op is ignored', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  await execute('orgIntegration.supabase', 'select', {
    slug: 'acme',
    table: 'profiles',
    op: 'delete'
  })

  t.equal(calls[0].args[0].op, 'select', 'verb wins over the bag op — no op spoofing')
  t.end()
})

test('orgIntegration.supabase rejects unsupported ops', async (t) => {
  const execute = createEntityDispatcher(makeSdk([]))

  t.throws(
    () => execute('orgIntegration.supabase', 'rpc', { slug: 'acme' }),
    /does not support op 'rpc'/,
    'unregistered op throws with the supported-ops message'
  )
  t.end()
})
