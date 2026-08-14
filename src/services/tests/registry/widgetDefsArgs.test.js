import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for `workspaceProject.widgetDefs` (WIDGETDEF-1,
// tickets/sonnet.md — AI-created home widgets, tickets/opus.md "Per-workspace
// AI-CREATED widgets").
//
// The route was registered in `sdk 84c4bcc` (EntityDispatcher.js +
// WorkspaceProjectService.js#widgetDefs, backed by the server's
// `/core/widget-defs` CRUD, server a89fa1c2) but shipped with no unit
// coverage — a typo in the entity key or an argMap regression would only
// have surfaced as a live "Unknown entity: 'workspaceProject.widgetDefs'" (or
// a silently mis-shaped request) in a deployed console. These tests lock the
// dispatch contract the same way `workspaceProject.records` and
// `workspaceProject.fileCanvas` already do:
//
//   - the entity RESOLVES (proves it is not `Unknown entity: …`)
//   - list/create/update/remove map to the right positional args
//   - `workspaceId` rides the trailing options positional (never the body),
//     matching WorkspaceProjectService's `widgetDefs.{list,create,update,
//     remove}(…, opts)` signatures — same explicit-workspace-pin pattern as
//     homeDashboardPrefs, so a widget def read/write can't land under a
//     workspace other than the one the caller pinned.
//
// Acceptance 2 (zero "ai widget defs fetch failed" in a deployed console) and
// acceptance 3 (the AI-widgets surface renders a seeded widget) are NOT
// covered here — both require a live deployed env, and nothing is deploying
// right now (org-wide CI/deploy backlog, tracked elsewhere). The `list`
// resolves-with-rows test below is the closest a dispatch-layer unit test can
// get to acceptance 3: it proves a seeded widget row survives the SDK's
// entity-dispatch path back to the caller unmodified.

const makeSdk = (calls, listResult = []) => ({
  getService: () => ({
    widgetDefs: {
      list: (...args) => (
        calls.push({ method: 'list', args }), Promise.resolve(listResult)
      ),
      create: (...args) => (
        calls.push({ method: 'create', args }), Promise.resolve({})
      ),
      update: (...args) => (
        calls.push({ method: 'update', args }), Promise.resolve({})
      ),
      remove: (...args) => (
        calls.push({ method: 'remove', args }), Promise.resolve({})
      )
    }
  })
})

test('workspaceProject.widgetDefs is a registered entity (resolves, does not throw Unknown entity)', (t) => {
  const execute = createEntityDispatcher(makeSdk([]))
  const route = execute.getRoute('workspaceProject.widgetDefs')
  t.ok(route, 'route is registered in ENTITY_ROUTES')
  t.equal(route.service, 'workspaceProject', 'routes to the workspaceProject service')
  t.deepEqual(
    Object.keys(route.methods).sort(),
    ['create', 'list', 'remove', 'update'],
    'supports list/create/update/remove'
  )
  t.ok(
    execute.listEntities().includes('workspaceProject.widgetDefs'),
    'shows up in the introspection list too'
  )
  t.end()
})

test('widgetDefs.list resolves with no args when no workspaceId is given', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'list', {})
  t.deepEqual(calls[0].args, [], 'no positional args — service falls back to ambient activeWorkspaceId')
  t.end()
})

test('widgetDefs.list threads an explicit workspaceId as the sole options positional', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'list', { workspaceId: 'ws_1' })
  t.deepEqual(
    calls[0].args,
    [{ workspaceId: 'ws_1' }],
    'workspaceId rides the options positional, matching list(opts)'
  )
  t.end()
})

test('widgetDefs.list resolves with the rows the service returns (seeded-widget pass-through)', async (t) => {
  const seeded = [
    { id: 'wd_1', body: { blocks: [] }, dataRecipe: { source: 'tickets' }, viewerCapability: { allowed: true } }
  ]
  const execute = createEntityDispatcher(makeSdk([], seeded))
  const rows = await execute('workspaceProject.widgetDefs', 'list', { workspaceId: 'ws_1' })
  t.deepEqual(rows, seeded, 'a seeded widget def row survives the dispatch path unmodified')
  t.end()
})

test('widgetDefs.create sends the widget body as the sole positional when no workspaceId is given', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const widget = { title: 'Open tickets', body: { blocks: [] }, dataRecipe: { source: 'tickets' } }
  await execute('workspaceProject.widgetDefs', 'create', { widget })
  t.deepEqual(calls[0].args, [widget], 'widget is the only positional — no trailing options')
  t.end()
})

test('widgetDefs.create threads workspaceId as options alongside the widget body', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const widget = { title: 'Open tickets', body: { blocks: [] } }
  await execute('workspaceProject.widgetDefs', 'create', { widget, workspaceId: 'ws_1' })
  const [body, opts] = calls[0].args
  t.deepEqual(body, widget, 'widget body is unchanged')
  t.deepEqual(opts, { workspaceId: 'ws_1' }, 'workspaceId rides the options positional, matching create(widget, opts)')
  t.end()
})

test('widgetDefs.create still honours the packed { payload } shape', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const payload = { title: 'Revenue this month', body: { blocks: [] } }
  await execute('workspaceProject.widgetDefs', 'create', { payload })
  t.deepEqual(calls[0].args, [payload], 'a packed payload is forwarded verbatim when no `widget` key is present')
  t.end()
})

test('widgetDefs.update sends id and widget positionally, no options when workspaceId is absent', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const widget = { title: 'Renamed widget' }
  await execute('workspaceProject.widgetDefs', 'update', { id: 'wd_1', widget })
  const [id, body, opts] = calls[0].args
  t.equal(id, 'wd_1', 'id is the first positional')
  t.deepEqual(body, widget, 'widget is the second positional')
  t.equal(opts, undefined, 'no options positional when the caller supplied no workspaceId')
  t.end()
})

test('widgetDefs.update threads workspaceId as the trailing options positional', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  const widget = { title: 'Renamed widget' }
  await execute('workspaceProject.widgetDefs', 'update', { id: 'wd_1', widget, workspaceId: 'ws_1' })
  const [id, body, opts] = calls[0].args
  t.equal(id, 'wd_1', 'id is the first positional')
  t.deepEqual(body, widget, 'widget is the second positional')
  t.deepEqual(opts, { workspaceId: 'ws_1' }, 'workspaceId rides the options positional, matching update(id, widget, opts)')
  t.end()
})

test('widgetDefs.update defaults the body to {} when no widget/payload/data is supplied', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'update', { id: 'wd_1' })
  const [id, body] = calls[0].args
  t.equal(id, 'wd_1', 'id is the first positional')
  t.deepEqual(body, {}, 'body defaults to an empty object rather than undefined')
  t.end()
})

test('widgetDefs.remove sends id with no options when workspaceId is absent', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'remove', { id: 'wd_1' })
  t.deepEqual(calls[0].args, ['wd_1'], 'id is the sole positional')
  t.end()
})

test('widgetDefs.remove threads workspaceId as the trailing options positional', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.widgetDefs', 'remove', { id: 'wd_1', workspaceId: 'ws_1' })
  const [id, opts] = calls[0].args
  t.equal(id, 'wd_1', 'id is the first positional')
  t.deepEqual(opts, { workspaceId: 'ws_1' }, 'workspaceId rides the options positional, matching remove(id, opts)')
  t.end()
})
