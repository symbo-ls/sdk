import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for `workspaceProject.fileCanvas`.
//
// REGRESSION GUARD (workspace tickets/sonnet.md, FILES-RENAME-1). This entity
// used the generic CRUD_ARG_MAP, which has no third "options" positional for
// get/create/update/remove — so a caller could never thread an explicit
// workspaceId through `sdk.execute`, and every write fell back SOLELY to the
// SDK's AMBIENT `_context.activeWorkspaceId`. When that ambient context is
// unset or stale (multi-workspace-tabs off, or a boot race before
// `bootShell`'s `sdk.updateContext` lands), the server's workspace-pin guard
// 404s "not found" for a real, visible row — a folder rename silently
// reverted with no toast, only a console.error. Switched to WS_CRUD_ARG_MAP,
// the SAME map the other Phase-2/3/4 workspace-scoped services already use
// (`(…, { workspaceId })` trailing options) — these tests lock that an
// explicit `workspaceId` now rides the options positional exactly like
// `workspaceProject.records`, and that every other shape is unaffected.

const makeSdk = (calls) => ({
  getService: () => ({
    fileCanvas: {
      list: (...args) => (calls.push({ method: 'list', args }), Promise.resolve([])),
      get: (...args) => (calls.push({ method: 'get', args }), Promise.resolve({})),
      create: (...args) => (calls.push({ method: 'create', args }), Promise.resolve({})),
      update: (...args) => (calls.push({ method: 'update', args }), Promise.resolve({})),
      remove: (...args) => (calls.push({ method: 'remove', args }), Promise.resolve({}))
    }
  })
})

test('fileCanvas.update sends id positionally and threads workspaceId as options', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'update', {
    id: 'node-1',
    payload: { name: 'Renamed folder', workspaceId: 'ws_1' }
  })
  const [id, body] = calls[0].args
  t.equal(id, 'node-1', 'id is the first positional')
  t.equal(body.name, 'Renamed folder', 'name survives the arg map')
  // workspaceId embedded in payload (the shape nodeOps.js's commitRenameNode
  // sends) is read by WorkspaceProjectService's own
  // `_fileCanvasWorkspaceId(source, options)` fallback (checks `source.
  // workspaceId` when no options positional carries one) — so it staying in
  // the body here is correct, not a leak: the server's pickWritableFields
  // allow-list ignores the unknown key.
  t.equal(body.workspaceId, 'ws_1', 'workspaceId reaches the service call')
  t.end()
})

test('fileCanvas.update forwards a TOP-LEVEL workspaceId as the options positional', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'update', {
    id: 'node-1',
    payload: { name: 'Renamed folder' },
    workspaceId: 'ws_2'
  })
  const [id, body, opts] = calls[0].args
  t.equal(id, 'node-1', 'id is the first positional')
  t.deepEqual(body, { name: 'Renamed folder' }, 'body carries only the payload')
  t.deepEqual(opts, { workspaceId: 'ws_2' }, 'workspaceId rides the options positional')
  t.end()
})

test('fileCanvas.remove threads an explicit workspaceId as options', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'remove', { id: 'node-1', workspaceId: 'ws_1' })
  const [id, opts] = calls[0].args
  t.equal(id, 'node-1', 'id is the first positional')
  t.deepEqual(opts, { workspaceId: 'ws_1' }, 'workspaceId rides the options positional')
  t.end()
})

test('fileCanvas.remove with no workspaceId sends no options (unchanged for existing callers)', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'remove', { id: 'node-1' })
  const [id, opts] = calls[0].args
  t.equal(id, 'node-1', 'id is the first positional')
  t.equal(opts, undefined, 'no options positional when the caller supplied no workspaceId')
  t.end()
})

test('fileCanvas.create keeps sending the payload as the bare body when no workspaceId is set', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'create', {
    payload: { kind: 'folder', name: 'New folder' }
  })
  t.deepEqual(
    calls[0].args[0],
    { kind: 'folder', name: 'New folder' },
    'a packed payload is forwarded verbatim — unchanged from CRUD_ARG_MAP'
  )
  t.end()
})

test('fileCanvas.list is unaffected — still the plain filter/options map', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.fileCanvas', 'list', { parent_id: 'f1', workspaceId: 'ws_1' })
  const [filter, opts] = calls[0].args
  // filterOptions (unchanged by this fix) keeps workspaceId in BOTH the
  // filter rest AND the options bag — fileCanvas.list reads it off options
  // first, so this is pre-existing, correct behavior, not a regression.
  t.deepEqual(
    filter,
    { parent_id: 'f1', workspaceId: 'ws_1' },
    'parent_id survives as the filter'
  )
  t.equal(opts.workspaceId, 'ws_1', 'workspaceId still rides the options bag')
  t.end()
})
