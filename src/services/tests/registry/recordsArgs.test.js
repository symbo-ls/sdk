import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for `workspaceProject.records`.
//
// REGRESSION GUARD. This entity is the one CRUD surface whose body carries a
// first-class `data` field (`{ collection, name, data }`). The generic
// workspace CRUD arg map resolves a body as `payload ?? data ?? rest`, so on a
// flat write its `data` branch fired on the RECORD PAYLOAD and returned just
// that — `collection` and `name` never reached the wire. The server answered
// "A `collection` namespace is required", which reads as a caller mistake and
// was really an unpacking bug in this file.
//
// It failed silently in two places at once: workspace-module board autosave
// (every create) and row create/update on the workspace `/data` surface. Both
// pass the documented flat shape, so nothing looked wrong at the call site.

const makeSdk = (calls) => ({
  getService: () => ({
    records: {
      list: (...args) => (
        calls.push({ method: 'list', args }),
        Promise.resolve([])
      ),
      get: (...args) => (
        calls.push({ method: 'get', args }),
        Promise.resolve({})
      ),
      create: (...args) => (
        calls.push({ method: 'create', args }),
        Promise.resolve({})
      ),
      update: (...args) => (
        calls.push({ method: 'update', args }),
        Promise.resolve({})
      ),
      remove: (...args) => (
        calls.push({ method: 'remove', args }),
        Promise.resolve({})
      )
    }
  })
})

test('records.create keeps collection + name alongside the data field', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.records', 'create', {
    collection: 'excalidraw_boards',
    name: 'Untitled board',
    data: { elements: [1, 2], appState: { viewBackgroundColor: '#fff' } }
  })
  const body = calls[0].args[0]
  t.equal(
    body.collection,
    'excalidraw_boards',
    'collection survives the arg map'
  )
  t.equal(body.name, 'Untitled board', 'name survives the arg map')
  t.deepEqual(
    body.data.elements,
    [1, 2],
    'the record payload is still nested under data'
  )
  t.end()
})

test('records.update sends id positionally and keeps collection in the body', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.records', 'update', {
    id: 'rec_1',
    collection: 'excalidraw_boards',
    data: { elements: [] }
  })
  const [id, body] = calls[0].args
  t.equal(id, 'rec_1', 'id is the first positional')
  t.equal(
    body.collection,
    'excalidraw_boards',
    'collection survives the arg map'
  )
  t.notOk('id' in body, 'id is not duplicated into the body')
  t.deepEqual(
    body.data,
    { elements: [] },
    'the record payload is still nested under data'
  )
  t.end()
})

test('records writes still honour the packed { payload } shape', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.records', 'create', {
    payload: { collection: 'cms_entries', data: { a: 1 } }
  })
  t.deepEqual(
    calls[0].args[0],
    { collection: 'cms_entries', data: { a: 1 } },
    'a packed payload is forwarded verbatim'
  )
  t.end()
})

test('records writes forward workspaceId as options, never as body', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('workspaceProject.records', 'create', {
    collection: 'excalidraw_boards',
    data: {},
    workspaceId: 'ws_1'
  })
  const [body, opts] = calls[0].args
  t.notOk('workspaceId' in body, 'workspaceId is stripped from the body')
  t.deepEqual(
    opts,
    { workspaceId: 'ws_1' },
    'workspaceId rides the options positional'
  )
  t.end()
})
