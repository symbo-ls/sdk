import test from 'tape'

import { createEntityDispatcher } from '../../EntityDispatcher.js'

// CORE-ANALYZED-KIND-UTC-TOTALS-ROLLUPS-1: the overall-totals ops are
// reachable through `sdk.execute('analyzed', …)` with the documented arg
// shapes — totals takes a bare filter (or `{ filter }`), pages / referrers
// take `{ filter, options }`.

const harness = () => {
  const calls = {}
  const svc = {}
  for (const m of ['totals', 'pages', 'referrers', 'campaigns', 'daily']) {
    svc[m] = (...args) => {
      calls[m] = args
      return Promise.resolve({ ok: true })
    }
  }
  const execute = createEntityDispatcher({
    getService: (name) => (name === 'analyzed' ? svc : null)
  })
  return { calls, execute }
}

test('analyzed.totals: a bare arg IS the filter; an explicit { filter } wins; nothing → {}', async (t) => {
  const { calls, execute } = harness()
  await execute('analyzed', 'totals', { family: 'projects', tz: 'Asia/Tbilisi' })
  t.deepEqual(calls.totals, [{ family: 'projects', tz: 'Asia/Tbilisi' }])
  await execute('analyzed', 'totals', { filter: { family: 'workspace' } })
  t.deepEqual(calls.totals, [{ family: 'workspace' }])
  await execute('analyzed', 'totals')
  t.deepEqual(calls.totals, [{}])
  t.end()
})

test('analyzed.pages / referrers: [filter, options], each defaulting to {}', async (t) => {
  const { calls, execute } = harness()
  await execute('analyzed', 'pages', {
    filter: { family: 'projects' },
    options: { limit: 5, offset: 10 }
  })
  t.deepEqual(calls.pages, [{ family: 'projects' }, { limit: 5, offset: 10 }])
  await execute('analyzed', 'pages', {})
  t.deepEqual(calls.pages, [{}, {}])

  await execute('analyzed', 'referrers', {
    filter: { family: 'workspace' },
    options: { limit: 3 }
  })
  t.deepEqual(calls.referrers, [{ family: 'workspace' }, { limit: 3 }])
  await execute('analyzed', 'referrers')
  t.deepEqual(calls.referrers, [{}, {}])
  t.end()
})

// CORE-ANALYZED-UTM-ATTRIBUTION-1: campaigns takes { filter, options } like
// pages / referrers.
test('analyzed.campaigns: [filter, options], each defaulting to {}', async (t) => {
  const { calls, execute } = harness()
  await execute('analyzed', 'campaigns', {
    filter: { family: 'projects', groupBy: 'source' },
    options: { limit: 10, offset: 20 }
  })
  t.deepEqual(calls.campaigns, [{ family: 'projects', groupBy: 'source' }, { limit: 10, offset: 20 }])
  await execute('analyzed', 'campaigns', {})
  t.deepEqual(calls.campaigns, [{}, {}])
  await execute('analyzed', 'campaigns')
  t.deepEqual(calls.campaigns, [{}, {}])
  t.end()
})

// Addendum 2: daily takes a bare filter (or `{ filter }`) like totals.
test('analyzed.daily: a bare arg IS the filter; an explicit { filter } wins; nothing → {}', async (t) => {
  const { calls, execute } = harness()
  await execute('analyzed', 'daily', { family: 'projects', tz: 'Asia/Tbilisi', days: 30 })
  t.deepEqual(calls.daily, [{ family: 'projects', tz: 'Asia/Tbilisi', days: 30 }])
  await execute('analyzed', 'daily', { filter: { family: 'workspace' } })
  t.deepEqual(calls.daily, [{ family: 'workspace' }])
  await execute('analyzed', 'daily')
  t.deepEqual(calls.daily, [{}])
  t.end()
})
