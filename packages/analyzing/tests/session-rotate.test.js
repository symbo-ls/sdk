import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createAnalyzing } from '../src/client.js'

// tickets/analytics.md ANALYZING-SESSION-ROTATE-1 — startNewSession() on the
// client: the boot session is ENDED (terminal envelope) and every later
// envelope carries a DIFFERENT session id; `sessionId` is live. Asserts the
// ids on the wire, not the absence of an error.

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('startNewSession ends the old session and stamps the next envelopes with a new id', async () => {
  const calls = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => { calls.push(envelope); return { ok: true } },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1,
    sessionId: 'boot-id'
  })
  a.state.activate(null)
  assert.equal(a.sessionId, 'boot-id')
  a.captureMessage('before', 'info')
  await wait(20)

  const next = a.startNewSession()
  assert.notEqual(next, 'boot-id')
  assert.equal(a.sessionId, next, 'sessionId is live after rotation')

  a.captureMessage('after', 'info')
  await wait(20)

  const before = calls.filter((c) => c.events.some((e) => e.message === 'before'))
  const after = calls.filter((c) => c.events.some((e) => e.message === 'after'))
  const terminal = calls.filter((c) => c.session.id === 'boot-id' && typeof c.session.endedAt === 'number')
  assert.equal(before.length, 1)
  assert.equal(before[0].session.id, 'boot-id')
  assert.equal(after.length, 1)
  assert.equal(after[0].session.id, next)
  assert.equal(after[0].session.endedAt, undefined)
  assert.equal(terminal.length, 1, 'the old session got exactly one terminal envelope')
})

test('rotating twice yields three distinct ids and only the last is live', async () => {
  const a = createAnalyzing({
    appKey: 'app',
    transport: () => ({ ok: true }),
    batchMs: 5,
    sessionId: 's0'
  })
  a.state.activate(null)
  const s1 = a.startNewSession()
  const s2 = a.startNewSession()
  assert.equal(new Set(['s0', s1, s2]).size, 3)
  assert.equal(a.sessionId, s2)
})
