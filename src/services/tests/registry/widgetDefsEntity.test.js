import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for `workspaceProject.widgetDefs`.
//
// REGRESSION GUARD (tickets/sonnet.md, WIDGETDEF-1). The server side shipped
// first (`server a89fa1c2`, `/core/widget-defs` CRUD) and the AI-widgets
// client shipped against it (`workspace b27a092e`) — but the entity was never
// registered on the SDK side, so every deployed env logged
//
//   Error: [sdk.execute] Unknown entity: 'workspaceProject.widgetDefs'
//
// and the feature had never once functioned in production. Registered by
// `sdk 84c4bcc`; these tests exist so the registration cannot silently
// disappear again.
//
// Why a test and not a code read: the entry EXISTING in the map does not prove
// `execute()` routes through it — a wrong `service` name throws from the proxy
// and a bad `methods` value throws a TypeError, both at call time, neither at
// import time. Only dispatching actually exercises that path.
//
// The failure mode is what makes this worth guarding: the caller fails soft
// inside a `Promise.all`, so the home board renders its ordinary empty state
// ("Nothing on your list — add one above.") rather than an error. The surface
// looks intentionally blank, which is indistinguishable from "the user has no
// widgets" — so absence of a visible problem is NOT evidence here. Assert the
// dispatch, not the absence of a throw.

const makeSdk = (calls) => ({
  getService: (name) => {
    if (name !== 'workspaceProject') {
      throw new Error(`unexpected service '${name}'`)
    }
    return {
      widgetDefs: {
        list: (...args) => (calls.push({ method: 'list', args }), Promise.resolve([])),
        create: (...args) => (calls.push({ method: 'create', args }), Promise.resolve({})),
        update: (...args) => (calls.push({ method: 'update', args }), Promise.resolve({})),
        remove: (...args) => (calls.push({ method: 'remove', args }), Promise.resolve({}))
      }
    }
  }
})

test('workspaceProject.widgetDefs resolves instead of throwing "Unknown entity"', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))

  // The exact call the AI-widgets home resolver makes. Before sdk 84cbcc4 this
  // threw before any HTTP request was built.
  await execute('workspaceProject.widgetDefs', 'list', { workspaceId: 'ws_1' })

  t.equal(calls.length, 1, 'the dispatcher reached the service, not an error path')
  t.equal(calls[0].method, 'list', 'routed to widgetDefs.list')
  t.deepEqual(calls[0].args, [{ workspaceId: 'ws_1' }], 'workspaceId rides the options positional')
  t.end()
})

test('widgetDefs.list omits the options positional when no workspaceId is given', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'list', {})
  t.deepEqual(calls[0].args, [], 'no empty {} is sent — the service falls back to ambient context')
  t.end()
})

test('widgetDefs.create accepts widget/payload/data aliases for the body', async (t) => {
  for (const key of ['widget', 'payload', 'data']) {
    const calls = []
    const execute = createEntityDispatcher(makeSdk(calls))
    await execute('workspaceProject.widgetDefs', 'create', {
      [key]: { title: 'Standup' },
      workspaceId: 'ws_1'
    })
    const [body, options] = calls[0].args
    t.deepEqual(body, { title: 'Standup' }, `'${key}' is unwrapped into the body positional`)
    t.deepEqual(options, { workspaceId: 'ws_1' }, `'${key}' still threads workspaceId as options`)
  }
  t.end()
})

test('widgetDefs.update sends id positionally, then body, then options', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'update', {
    id: 'wd_1',
    widget: { title: 'Renamed' },
    workspaceId: 'ws_1'
  })
  t.deepEqual(calls[0].args, ['wd_1', { title: 'Renamed' }, { workspaceId: 'ws_1' }],
    'positional order matches the service signature')
  t.end()
})

test('widgetDefs.update defaults to an empty body rather than undefined', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'update', { id: 'wd_1' })
  // `undefined` here would serialize away and turn a no-op PATCH into a
  // malformed one; the arg map deliberately substitutes {}.
  t.deepEqual(calls[0].args, ['wd_1', {}], 'body is {}, not undefined')
  t.end()
})

test('widgetDefs.remove sends the id positionally', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'remove', { id: 'wd_1', workspaceId: 'ws_1' })
  t.deepEqual(calls[0].args, ['wd_1', { workspaceId: 'ws_1' }], 'id first, options trailing')
  t.end()
})

test('an unregistered sibling entity still throws — the guard itself is real', async (t) => {
  const execute = createEntityDispatcher(makeSdk([]))
  // Negative control: proves these assertions would actually fail if the
  // registration were removed, rather than passing because the dispatcher is
  // permissive about unknown names.
  try {
    await execute('workspaceProject.widgetDefsNope', 'list', {})
    t.fail('an unknown entity should throw')
  } catch (err) {
    t.ok(/Unknown entity/i.test(err.message), 'unknown entities still raise "Unknown entity"')
  }
  t.end()
})
