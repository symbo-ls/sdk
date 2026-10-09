import test from 'tape'
import { createSseParser, readSseStream } from '../../../utils/sseParser.js'

// The SSE parser behind sdk.ai.turnStream (src/utils/sseParser.js), checked
// against the WHATWG event-stream rules it claims: line ends (CRLF, LF, CR —
// a CR at a chunk's end waits for its LF), comments, multi-line data, the
// one optional space after the colon, events without data, a leading BOM,
// an unterminated last frame, and chunk boundaries ANYWHERE — including
// inside a multi-byte UTF-8 character, which readSseStream decodes across
// chunks. Lives under services/tests so the unit glob runs it.

const collect = (text, chunkSizes = null) => {
  const events = []
  const comments = []
  const parser = createSseParser((e) => events.push(e), {
    onComment: (c) => comments.push(c)
  })
  if (!chunkSizes) parser.push(text)
  else {
    let at = 0
    let i = 0
    while (at < text.length) {
      const size = chunkSizes[i++ % chunkSizes.length]
      parser.push(text.slice(at, at + size))
      at += size
    }
  }
  parser.end()
  return { events, comments }
}

const SAMPLE =
  ': heartbeat\n\n' +
  'event: delta\ndata: {"text":"Hel"}\n\n' +
  'event: delta\r\ndata: {"text":"lo"}\r\n\r\n' +
  'event: reset\rdata: {"reason":"step"}\r\r' +
  'event: done\ndata: {"text":"lo",\ndata: "type":"final_text"}\n\n'

test('sse: events, CRLF / CR / LF line ends, comments and multi-line data', (t) => {
  const { events, comments } = collect(SAMPLE)
  t.deepEqual(
    events.map((e) => e.event),
    ['delta', 'delta', 'reset', 'done']
  )
  t.deepEqual(JSON.parse(events[0].data), { text: 'Hel' })
  t.deepEqual(JSON.parse(events[1].data), { text: 'lo' }, 'CRLF frame')
  t.deepEqual(JSON.parse(events[2].data), { reason: 'step' }, 'CR-only frame')
  t.equal(events[3].data, '{"text":"lo",\n"type":"final_text"}', 'data lines join with \\n')
  t.deepEqual(JSON.parse(events[3].data), { text: 'lo', type: 'final_text' })
  t.deepEqual(comments, ['heartbeat'], 'the heartbeat is a comment, not an event')
  t.end()
})

test('sse: every chunk boundary yields the same events (1..7-char chunks, mixed)', (t) => {
  const whole = collect(SAMPLE).events
  for (const sizes of [[1], [2], [3], [5], [7], [1, 4, 2], [6, 1, 1, 3]]) {
    t.deepEqual(collect(SAMPLE, sizes).events, whole, `chunks of ${sizes.join('/')}`)
  }
  t.end()
})

test('sse: a CR that ends a chunk waits — CR + LF across chunks is ONE line end', (t) => {
  const events = []
  const parser = createSseParser((e) => events.push(e))
  parser.push('data: a\r')
  parser.push('\ndata: b\r')
  parser.push('\n\r')
  parser.push('\n')
  parser.end()
  t.equal(events.length, 1, 'one event, not an empty-line dispatch in the middle')
  t.equal(events[0].data, 'a\nb')
  t.end()
})

test('sse: field details — no space after the colon, no colon, unknown fields, id, retry', (t) => {
  const { events } = collect(
    'event:delta\ndata:{"text":"tight"}\n\n' +
      'data\n\n' +
      'foo: bar\nretry: 10\nid: 7\nevent: x\ndata:  two spaces\n\n'
  )
  t.equal(events[0].event, 'delta')
  t.equal(events[0].data, '{"text":"tight"}', 'no space after the colon')
  t.equal(events[1].event, 'message', 'default type')
  t.equal(events[1].data, '', 'a bare `data` field is an empty data line')
  t.equal(events[2].event, 'x')
  t.equal(events[2].data, ' two spaces', 'only ONE leading space is dropped')
  t.equal(events[2].id, '7')
  t.end()
})

test('sse: an event with no data is not dispatched, and its type does not leak to the next', (t) => {
  const { events } = collect('event: lonely\n\ndata: {"a":1}\n\n')
  t.equal(events.length, 1)
  t.equal(events[0].event, 'message')
  t.end()
})

test('sse: a leading BOM is dropped; an unterminated last frame is discarded', (t) => {
  const { events } = collect('﻿event: delta\ndata: {"text":"x"}\n\nevent: done\ndata: {"text":"x"}')
  t.deepEqual(
    events.map((e) => e.event),
    ['delta'],
    'the cut-off done frame never dispatches'
  )
  t.end()
})

const streamOf = (chunks) =>
  new ReadableStream({
    start (controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    }
  })

test('readSseStream: UTF-8 split inside a character decodes whole; returning false stops the read', async (t) => {
  const bytes = new TextEncoder().encode(
    'event: delta\ndata: {"text":"გამარჯობა 👋"}\n\nevent: done\ndata: {}\n\nevent: delta\ndata: {"text":"after"}\n\n'
  )
  // Cut every 3 bytes: Georgian letters are 3 bytes, the emoji 4 — most cuts
  // land inside a character.
  const chunks = []
  for (let i = 0; i < bytes.length; i += 3) chunks.push(bytes.slice(i, i + 3))
  const seen = []
  await readSseStream(streamOf(chunks), (e) => {
    seen.push(e)
    if (e.event === 'done') return false
  })
  t.equal(seen.length, 2, 'stopped at done')
  t.equal(JSON.parse(seen[0].data).text, 'გამარჯობა 👋')
  t.end()
})

test('readSseStream: a body that errors rejects with that error', async (t) => {
  let ctrl
  const body = new ReadableStream({
    start (c) {
      ctrl = c
      c.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"a"}\n\n'))
    }
  })
  const seen = []
  const pending = readSseStream(body, (e) => seen.push(e))
  await new Promise((r) => setTimeout(r, 5))
  const boom = new Error('socket hang up')
  ctrl.error(boom)
  try {
    await pending
    t.fail('should reject')
  } catch (e) {
    t.equal(e, boom)
  }
  t.equal(seen.length, 1, 'what arrived before the failure was delivered')
  t.end()
})
