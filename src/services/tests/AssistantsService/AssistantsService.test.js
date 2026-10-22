// AssistantsService: the admin API's addresses, methods and bodies; the token on every call; the error body's message.
import test from 'tape'
import assert from 'node:assert/strict'
import { AssistantsService, ASSISTANTS_ENTITY_ROUTE } from '../../AssistantsService.js'

const make = () => {
  const s = new AssistantsService({ options: { assistantsApiUrl: 'https://fly-control.example/' } })
  const seen = []
  // The real base class: a ready service, no hand-made getAuthToken (only
  // AuthService has one — a stub here hid "this.getAuthToken is not a
  // function" on dev 2026-10-22). _requestExternal attaches the token itself.
  s._setReady()
  s._requestExternal = async (url, init) => { seen.push({ url, init }); return { ok: true } }
  return { s, seen }
}

test('each op calls its admin route with its method and body', async (t) => {
  const { s, seen } = make()
  await s.list()
  await s.get({ id: 'skai-gpu-calculator' })
  await s.update({ id: 'skai-gpu-calculator', version: 'v1', set: { rateLimit: { chat: { perIpPerMin: 20 } } } })
  await s.revisions({ id: 'skai-gpu-calculator' })
  await s.rollback({ id: 'skai-gpu-calculator', revision: 'r', version: 'v2' })
  await s.usage({ id: 'skai-gpu-calculator' })
  await s.resetCounter({ id: 'skai-gpu-calculator', kind: 'chat', scope: 'ip', ip: '203.0.113.9' })
  await s.testChat({ id: 'skai-gpu-calculator', message: 'hi' })
  const B = 'https://fly-control.example/admin/assistants'
  assert.deepEqual(seen.map((x) => [x.init.method || 'GET', x.url]), [
    ['GET', B], ['GET', B + '/skai-gpu-calculator'], ['PATCH', B + '/skai-gpu-calculator'], ['GET', B + '/skai-gpu-calculator/revisions'],
    ['POST', B + '/skai-gpu-calculator/rollback'], ['GET', B + '/skai-gpu-calculator/usage'], ['POST', B + '/skai-gpu-calculator/counters/reset'], ['POST', B + '/skai-gpu-calculator/chat']
  ])
  assert.deepEqual(seen[2].init.body, { version: 'v1', set: { rateLimit: { chat: { perIpPerMin: 20 } } } })
  assert.equal(seen[2].init.maxRetries, 0)
  assert.deepEqual(Object.keys(ASSISTANTS_ENTITY_ROUTE.methods), ['list', 'get', 'update', 'revisions', 'rollback', 'usage', 'resetCounter', 'testChat'])
  t.pass('ok')
})

test('a bad id is refused before any request; the error body names the message', async (t) => {
  const { s, seen } = make()
  await assert.rejects(() => s.get({ id: '../x' }), /assistant id/)
  assert.equal(seen.length, 0)
  s._requestExternal = async () => { const e = new Error('[object Object]', { cause: { error: { code: 'conflict', message: 'Someone changed it.' } } }); e.status = 409; throw e }
  await assert.rejects(() => s.list(), (e) => e.status === 409 && e.message === 'Someone changed it.' && e.cause.error.code === 'conflict')
  t.pass('ok')
})

test('the service runs on the base class alone (no getAuthToken) and refuses before init', async (t) => {
  const { s } = make()
  assert.equal(typeof s.getAuthToken, 'undefined', 'no stubbed token getter')
  const r = await s.list()
  assert.deepEqual(r, { ok: true })
  const cold = new AssistantsService({ options: { assistantsApiUrl: 'https://fly-control.example/' } })
  cold._requestExternal = async () => ({ ok: true })
  await assert.rejects(() => cold.list(), /not initialized/)
  t.pass('ready service calls through; a cold one refuses')
  t.end()
})
