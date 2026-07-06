import test from 'tape'
import sinon from 'sinon'
import { IntegrationService } from '../../IntegrationService.js'

// Unit coverage for the generic external-Supabase dispatch verb —
// supabaseProjectCall → POST /org-integrations/:idOrSlug/call. Transport is
// mocked (`_call` stub for URL/body construction, `_request` stub for the
// { success, data, message } envelope contract). The server contract lives
// in server/src/domains/integrations/* (kind `supabase_project`; per-table
// op allowlist + per-op role policy are enforced there).

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new IntegrationService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── URL + body construction ─────────────────────────────────────────────────

test('supabaseProjectCall POSTs /org-integrations/:idOrSlug/call with the full body', async t => {
  t.plan(4)
  const svc = makeService()
  const rows = [{ id: 'l1' }]
  const stub = sandbox.stub(svc, '_call').resolves(rows)

  const result = await svc.supabaseProjectCall({
    idOrSlug: 'acme',
    op: 'select',
    table: 'listings',
    filter: { status: 'active' },
    order: { column: 'created_at', ascending: false },
    limit: 25
  })

  const [, path, opts] = stub.firstCall.args
  t.equal(path, '/org-integrations/acme/call', 'URL matches')
  t.equal(opts.method, 'POST', 'method is POST')
  t.deepEqual(
    opts.body,
    {
      op: 'select',
      table: 'listings',
      filter: { status: 'active' },
      order: { column: 'created_at', ascending: false },
      limit: 25
    },
    'body carries { op, table, filter, order, limit }'
  )
  t.deepEqual(result, rows, 'resolves the unwrapped rows')
  sandbox.restore()
  t.end()
})

test('supabaseProjectCall sends only defined fields (no undefined keys on the wire)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)

  await svc.supabaseProjectCall({ idOrSlug: 'acme', op: 'introspect' })

  const [, , opts] = stub.firstCall.args
  t.deepEqual(opts.body, { op: 'introspect' }, 'body is just { op } for introspect')
  t.deepEqual(
    Object.keys(opts.body),
    ['op'],
    'undefined table/filter/order/limit/values are stripped'
  )
  sandbox.restore()
  t.end()
})

test('supabaseProjectCall carries insert/update values', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 't1' })

  await svc.supabaseProjectCall({
    idOrSlug: 'acme',
    op: 'insert',
    table: 'transactions',
    values: { amount: 100, type: 'credit' }
  })

  const [, , opts] = stub.firstCall.args
  t.equal(opts.body.op, 'insert', 'op rides in the body')
  t.deepEqual(opts.body.values, { amount: 100, type: 'credit' }, 'values pass through verbatim')
  sandbox.restore()
  t.end()
})

test('supabaseProjectCall URI-encodes the idOrSlug path segment', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves(null)

  await svc.supabaseProjectCall({ idOrSlug: 'ai/house x', op: 'select', table: 'profiles' })

  t.equal(
    stub.firstCall.args[1],
    '/org-integrations/ai%2Fhouse%20x/call',
    'URI-encoded path segment'
  )
  sandbox.restore()
  t.end()
})

test('supabaseProjectCall throws without idOrSlug / op', t => {
  t.plan(3)
  const svc = makeService()

  t.throws(() => svc.supabaseProjectCall({ op: 'select', table: 'profiles' }), /idOrSlug is required/)
  t.throws(() => svc.supabaseProjectCall({ idOrSlug: 'acme', table: 'profiles' }), /op is required/)
  t.throws(() => svc.supabaseProjectCall(), /idOrSlug is required/)
  sandbox.restore()
  t.end()
})

// ─── Envelope contract ({ success, data, message } via BaseService._call) ────

test('supabaseProjectCall unwraps the { success: true, data } envelope', async t => {
  t.plan(3)
  const svc = makeService()
  const rows = [{ id: 'p1', role: 'agent' }]
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: rows, message: 'ok' })

  const result = await svc.supabaseProjectCall({
    idOrSlug: 'acme',
    op: 'select',
    table: 'profiles',
    filter: { role: 'agent' }
  })

  const [endpoint, init] = stub.firstCall.args
  t.equal(endpoint, '/org-integrations/acme/call', 'hits the call endpoint')
  t.deepEqual(
    JSON.parse(init.body),
    { op: 'select', table: 'profiles', filter: { role: 'agent' } },
    'wire body is the JSON-encoded op payload'
  )
  t.deepEqual(result, rows, 'resolves envelope.data')
  sandbox.restore()
  t.end()
})

test('supabaseProjectCall throws the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({
    success: false,
    message: "op 'delete' not allowed on table 'profiles'"
  })

  try {
    await svc.supabaseProjectCall({ idOrSlug: 'acme', op: 'delete', table: 'profiles' })
    t.fail('should have thrown')
  } catch (error) {
    t.equal(
      error.message,
      "op 'delete' not allowed on table 'profiles'",
      'server message surfaces verbatim'
    )
  }
  sandbox.restore()
  t.end()
})
