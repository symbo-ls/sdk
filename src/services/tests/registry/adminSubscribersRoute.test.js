import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// sdk.execute('admin.subscribers', 'list', …) — the declarative door to
// GET /core/admin/subscribers (AdminService.getAdminSubscribers). Both caller
// shapes: imperative ({ status, limit, offset }) and the fetch-adapter pack
// ({ filter, options }). No other op is routed.

const makeSdk = (calls) => ({
  getService: (name) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string') return undefined
          return (...args) => {
            calls.push({ service: name, method, args })
            return Promise.resolve({ rows: [], summary: {}, paging: {} })
          }
        }
      }
    )
})

test('admin.subscribers list → admin.getAdminSubscribers with one options bag', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('admin.subscribers', 'list', {})
  await execute('admin.subscribers', 'list', { status: 'canceled', limit: 25, offset: 50 })
  await execute('admin.subscribers', 'list', { filter: { status: 'all' }, options: { limit: 10, offset: 20 } })
  t.deepEqual(calls.map(c => [c.service, c.method]), [
    ['admin', 'getAdminSubscribers'],
    ['admin', 'getAdminSubscribers'],
    ['admin', 'getAdminSubscribers']
  ])
  t.deepEqual(calls[0].args, [{ status: undefined, limit: undefined, offset: undefined, signal: undefined }], 'no args → server defaults')
  t.deepEqual(calls[1].args, [{ status: 'canceled', limit: 25, offset: 50, signal: undefined }], 'imperative shape')
  t.deepEqual(calls[2].args, [{ status: 'all', limit: 10, offset: 20, signal: undefined }], 'fetch-adapter pack')
  t.end()
})

test('admin.subscribers routes no write op', async t => {
  const execute = createEntityDispatcher(makeSdk([]))
  for (const op of ['create', 'update', 'remove']) {
    try {
      await execute('admin.subscribers', op, {})
      t.fail(`${op} should not resolve`)
    } catch (err) {
      t.ok(err instanceof Error, `${op} refused`)
    }
  }
  t.end()
})
