import test from 'tape'

import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Shaker program CONTRACT §8 (lane CORE-C): the funnel read is reachable as
// `sdk.execute('analyzed', 'funnel', …)` with a bare filter (like totals /
// daily), and listEvents carries `message` inside its { filter, options }.

const harness = () => {
  const calls = {}
  const svc = {}
  for (const m of ['funnel', 'listEvents']) {
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

test('analyzed.funnel: a bare arg IS the filter; an explicit { filter } wins; nothing → {}', async (t) => {
  const { calls, execute } = harness()
  const filter = {
    family: 'projects',
    projectId: 'shaker',
    steps: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    since: '2026-10-01',
    tz: 'Asia/Tbilisi',
    workspaceId: '6aadb5e0d03299e6a0719dcc'
  }
  await execute('analyzed', 'funnel', filter)
  t.deepEqual(calls.funnel, [filter])
  await execute('analyzed', 'funnel', { filter: { steps: 'purchase' } })
  t.deepEqual(calls.funnel, [{ steps: 'purchase' }])
  await execute('analyzed', 'funnel')
  t.deepEqual(calls.funnel, [{}])
  t.end()
})

test('analyzed.listEvents: message rides the filter pack', async (t) => {
  const { calls, execute } = harness()
  await execute('analyzed', 'listEvents', {
    filter: { message: 'purchase', logType: 'log' },
    options: { limit: 20 }
  })
  t.deepEqual(calls.listEvents, [{ message: 'purchase', logType: 'log' }, { limit: 20 }])
  t.end()
})
