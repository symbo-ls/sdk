import test from 'tape'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// CORE-AI-BOARDS-GENERATE-VOCABULARY-1 — the REGISTRATION half of `ai.boards`.
//
// AiBoardsService.test.js calls `registerEntity('ai.boards', …)` itself and
// hands the dispatcher a stub `getService`, so it stays green when nobody
// wires the service into the SDK — the state that first shipped: the service
// file existed, but `sdk.getService('aiBoards')` was undefined and
// `sdk.execute('ai.boards', …)` threw "unknown entity".
//
// This probe runs in a CHILD process — a fresh module graph that no other
// test file's `registerEntity` call can reach — builds a real SDK, and asks:
//   1. is 'ai.boards' a static entity route (listEntities, getRoute)?
//   2. does sdk.getService('aiBoards') answer an AiBoardsService?
//   3. does sdk.execute('ai.boards', 'vocabulary', …) reach that instance?
// The child stubs `_call` on the live instance, so no request leaves it.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const CHILD = `
const { SDK } = await import(${JSON.stringify(`${SRC}/index.js`)})
const { AiBoardsService, AI_BOARDS_ENTITY_ROUTE } = await import(${JSON.stringify(`${SRC}/services/AiBoardsService.js`)})
const { listEntities, createEntityDispatcher } = await import(${JSON.stringify(`${SRC}/services/EntityDispatcher.js`)})
const out = {
  listed: listEntities().includes('ai.boards'),
  sameRoute: createEntityDispatcher({ getService: () => null }).getRoute('ai.boards') === AI_BOARDS_ENTITY_ROUTE
}
const sdk = new SDK({ apiUrl: 'http://localhost:0/api' })
await sdk.initialize({})
let svc = null
try {
  svc = sdk.getService('aiBoards')
} catch (e) {
  out.getServiceError = String(e && e.message || e)
}
out.service = svc instanceof AiBoardsService
if (svc) {
  const calls = []
  svc._call = async (name, path) => { calls.push([name, path]); return { v: 1 } }
  try {
    await sdk.execute('ai.boards', 'vocabulary', { workspaceId: 'ws-1' })
  } catch (e) {
    out.executeError = String(e && e.message || e)
  }
  out.calls = calls
}
process.stdout.write(JSON.stringify(out))
process.exit(0)
`

test('ai.boards is registered: a static entity route, an SDK service, and sdk.execute reaches it', (t) => {
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const out = JSON.parse(raw.slice(raw.indexOf('{')))
  t.equal(out.listed, true, "listEntities() names 'ai.boards' without any registerEntity call")
  t.equal(out.sameRoute, true, "getRoute('ai.boards') is AI_BOARDS_ENTITY_ROUTE (the service's own map)")
  t.equal(out.service, true, "sdk.getService('aiBoards') is an AiBoardsService")
  t.equal(out.executeError, undefined, "sdk.execute('ai.boards', 'vocabulary') does not throw")
  t.deepEqual(
    out.calls,
    [['aiBoards.vocabulary', '/ai-boards/workspaces/ws-1/vocabulary']],
    'the dispatch lands on the SDK instance with the workspace-scoped path'
  )
  t.end()
})
