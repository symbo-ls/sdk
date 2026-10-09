import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'
import { NETWORK_UNREACHABLE } from '../../BaseService.js'

// sdk.ai.turnStream — the streamed ephemeral turn (POST
// /core/agents/workspaces/:id/turn with stream:true). A fake fetch serves an
// SSE body chunk by chunk (any boundary), so this pins: the request (the
// SAME body `turn` sends, + stream:true, Accept SSE, the bearer), onDelta's
// (deltaText, fullText) contract incl. a reset, heartbeats ignored, done →
// { text, usage, raw }, an `error` frame / an HTTP refusal / a cut stream →
// a rejection with the server's message and code, the abort path, and the
// JSON answer of a server that predates the stream.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const API = 'https://api.test'
const realFetch = globalThis.fetch

const makeService = ({ workspaceId = 'ws-1' } = {}) => {
  const svc = new AiService()
  svc._apiUrl = API
  svc._tokenManager = {
    ensureValidToken: async () => 'tok',
    getAuthHeader: () => 'Bearer tok'
  }
  sandbox.stub(svc, '_activeWorkspaceId').callsFake((given) => given || workspaceId)
  sandbox.stub(svc, 'getModelMode').returns('auto')
  return svc
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

// A Response whose SSE body is `text`, delivered in `chunkSize`-byte pieces,
// one per macrotask; the body errors with an AbortError when the request's
// signal aborts (as fetch does). `hang` keeps the body open after `text`.
const sseFetch = (text, { chunkSize = 7, hang = false, status = 200, contentType } = {}) => {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url, init })
    const bytes = new TextEncoder().encode(text)
    let at = 0
    let cancelled = false
    const body = new ReadableStream({
      start (controller) {
        init.signal?.addEventListener('abort', () => {
          if (cancelled) return
          try {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          } catch (_) {}
        })
      },
      async pull (controller) {
        await new Promise((r) => setTimeout(r, 1))
        if (cancelled) return
        if (at < bytes.length) {
          controller.enqueue(bytes.slice(at, at + chunkSize))
          at += chunkSize
          return
        }
        if (hang) return new Promise(() => {})
        controller.close()
      },
      cancel () {
        cancelled = true
      }
    })
    return new Response(body, {
      status,
      headers: { 'content-type': contentType || 'text/event-stream; charset=utf-8' }
    })
  }
  return { fetch, calls }
}

const jsonFetch = (status, json) => {
  const calls = []
  return {
    calls,
    fetch: async (url, init = {}) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(json), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      })
    }
  }
}

const withFetch = async (fake, fn) => {
  globalThis.fetch = fake
  try {
    return await fn()
  } finally {
    globalThis.fetch = realFetch
  }
}

const HAPPY =
  ': heartbeat\n\n' +
  frame('delta', { text: 'The ' }) +
  frame('delta', { text: 'answer ' }) +
  ': heartbeat\n\n' +
  frame('delta', { text: 'is 42.' }) +
  frame('done', {
    text: 'The answer is 42.',
    type: 'final_text',
    usage: { inputTokens: 12, outputTokens: 5 }
  })

test('turnStream: POSTs the turn body + stream:true to /turn with Accept SSE and the bearer', async (t) => {
  const svc = makeService()
  const fake = sseFetch(HAPPY)
  const payload = {
    messages: [{ role: 'user', content: 'Decide' }],
    system: 'studio',
    systemRef: 'vault-core',
    allowTools: false,
    modelMode: 'gemini'
  }
  await withFetch(fake.fetch, () => svc.turnStream(payload))
  t.equal(fake.calls.length, 1)
  const { url, init } = fake.calls[0]
  t.equal(url, `${API}/core/agents/workspaces/ws-1/turn`, 'the SAME route as turn()')
  t.equal(init.method, 'POST')
  t.equal(init.headers.Accept, 'text/event-stream')
  t.equal(init.headers['Content-Type'], 'application/json')
  t.equal(init.headers.Authorization, 'Bearer tok')
  t.deepEqual(
    JSON.parse(init.body),
    { ...svc._turnBody(payload), stream: true },
    'turn()\'s body + stream:true'
  )
  t.deepEqual(JSON.parse(init.body), {
    messages: [{ role: 'user', content: 'Decide' }],
    system: 'studio',
    systemRef: 'vault-core',
    allowTools: false,
    modelMode: 'gemini',
    stream: true
  })
  sandbox.restore()
  t.end()
})

test('turnStream: onDelta(deltaText, fullText) per delta; resolves { text, usage, raw } from done', async (t) => {
  const svc = makeService()
  const seen = []
  const out = await withFetch(sseFetch(HAPPY).fetch, () =>
    svc.turnStream({ content: 'q' }, { onDelta: (d, full) => seen.push([d, full]) })
  )
  t.deepEqual(seen, [
    ['The ', 'The '],
    ['answer ', 'The answer '],
    ['is 42.', 'The answer is 42.']
  ])
  t.equal(out.text, 'The answer is 42.')
  t.deepEqual(out.usage, { inputTokens: 12, outputTokens: 5 })
  t.equal(out.raw.type, 'final_text')
  sandbox.restore()
  t.end()
})

test('turnStream: the same result whatever the chunk boundaries (1..11 bytes)', async (t) => {
  for (const chunkSize of [1, 2, 3, 5, 11]) {
    const svc = makeService()
    let last = ''
    const out = await withFetch(sseFetch(HAPPY, { chunkSize }).fetch, () =>
      svc.turnStream({ content: 'q' }, { onDelta: (_d, full) => { last = full } })
    )
    t.equal(out.text, 'The answer is 42.', `chunks of ${chunkSize}`)
    t.equal(last, 'The answer is 42.')
    sandbox.restore()
  }
  t.end()
})

test('turnStream: a reset restarts fullText — onDelta("", "") then the new words; onReset gets the reason', async (t) => {
  const svc = makeService()
  const seen = []
  const reasons = []
  const body =
    frame('delta', { text: 'Let me check.' }) +
    frame('reset', { reason: 'step' }) +
    frame('delta', { text: 'Five rows.' }) +
    frame('done', { text: 'Five rows.', type: 'final_text', usage: {} })
  const out = await withFetch(sseFetch(body).fetch, () =>
    svc.turnStream(
      { content: 'q' },
      { onDelta: (d, full) => seen.push([d, full]), onReset: (r) => reasons.push(r) }
    )
  )
  t.deepEqual(seen, [
    ['Let me check.', 'Let me check.'],
    ['', ''],
    ['Five rows.', 'Five rows.']
  ])
  t.deepEqual(reasons, ['step'])
  t.equal(out.text, 'Five rows.')
  sandbox.restore()
  t.end()
})

test('turnStream: multi-line data frames and CRLF line ends parse', async (t) => {
  const svc = makeService()
  const body =
    'event: delta\r\ndata: {"text":\r\ndata: "Hi"}\r\n\r\n' +
    'event: done\r\ndata: {"text":"Hi","usage":{"inputTokens":1,"outputTokens":1}}\r\n\r\n'
  const out = await withFetch(sseFetch(body, { chunkSize: 4 }).fetch, () =>
    svc.turnStream({ content: 'q' })
  )
  t.equal(out.text, 'Hi')
  sandbox.restore()
  t.end()
})

test('turnStream: an error frame rejects with the server message and code', async (t) => {
  const svc = makeService()
  const body =
    frame('delta', { text: 'Half' }) +
    frame('error', { message: 'upstream refused the rest', code: 'UPSTREAM_REFUSED' })
  let seen = ''
  try {
    await withFetch(sseFetch(body).fetch, () =>
      svc.turnStream({ content: 'q' }, { onDelta: (_d, full) => { seen = full } })
    )
    t.fail('should reject')
  } catch (e) {
    t.equal(e.message, 'upstream refused the rest')
    t.equal(e.code, 'UPSTREAM_REFUSED')
  }
  t.equal(seen, 'Half', 'the words before the failure were delivered')
  sandbox.restore()
  t.end()
})

test('turnStream: an HTTP refusal before the stream (402 cap) rejects with message, code and status', async (t) => {
  const svc = makeService()
  const fake = jsonFetch(402, { success: false, error: 'ai_cap_exceeded', code: 'ai_cap_exceeded' })
  try {
    await withFetch(fake.fetch, () => svc.turnStream({ content: 'q' }))
    t.fail('should reject')
  } catch (e) {
    t.equal(e.message, 'ai_cap_exceeded')
    t.equal(e.code, 'ai_cap_exceeded')
    t.equal(e.status, 402)
  }
  sandbox.restore()
  t.end()
})

test('turnStream: a stream that ends without done rejects STREAM_TRUNCATED', async (t) => {
  const svc = makeService()
  try {
    await withFetch(sseFetch(frame('delta', { text: 'cut' })).fetch, () =>
      svc.turnStream({ content: 'q' })
    )
    t.fail('should reject')
  } catch (e) {
    t.equal(e.code, 'STREAM_TRUNCATED')
  }
  sandbox.restore()
  t.end()
})

test('turnStream: aborting the signal mid-stream rejects with an AbortError and stops onDelta', async (t) => {
  const svc = makeService()
  const ac = new AbortController()
  const seen = []
  const fake = sseFetch(frame('delta', { text: 'Partial' }), { hang: true })
  const pending = withFetch(fake.fetch, () =>
    svc.turnStream(
      { content: 'q' },
      {
        signal: ac.signal,
        onDelta: (d) => {
          seen.push(d)
          ac.abort()
        }
      }
    )
  )
  try {
    await pending
    t.fail('should reject')
  } catch (e) {
    t.equal(e.name, 'AbortError')
  }
  t.equal(fake.calls[0].init.signal, ac.signal, 'the caller signal rides the request')
  t.deepEqual(seen, ['Partial'])
  sandbox.restore()
  t.end()
})

test('turnStream: an already-aborted signal rejects before any frame', async (t) => {
  const svc = makeService()
  const ac = new AbortController()
  ac.abort()
  const fake = {
    fetch: async (_url, init) => {
      if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      return new Response('')
    }
  }
  try {
    await withFetch(fake.fetch, () => svc.turnStream({ content: 'q' }, { signal: ac.signal }))
    t.fail('should reject')
  } catch (e) {
    t.equal(e.name, 'AbortError')
  }
  sandbox.restore()
  t.end()
})

test('turnStream: a server without the stream answers JSON — resolved whole, onDelta once', async (t) => {
  const svc = makeService()
  const seen = []
  const fake = jsonFetch(200, {
    success: true,
    data: { text: 'Whole answer.', type: 'final_text', usage: { inputTokens: 3, outputTokens: 2 } }
  })
  const out = await withFetch(fake.fetch, () =>
    svc.turnStream({ content: 'q' }, { onDelta: (d, full) => seen.push([d, full]) })
  )
  t.equal(out.text, 'Whole answer.')
  t.deepEqual(out.usage, { inputTokens: 3, outputTokens: 2 })
  t.deepEqual(seen, [['Whole answer.', 'Whole answer.']])
  sandbox.restore()
  t.end()
})

test('turnStream: a throwing onDelta never breaks the turn', async (t) => {
  const svc = makeService()
  const out = await withFetch(sseFetch(HAPPY).fetch, () =>
    svc.turnStream(
      { content: 'q' },
      {
        onDelta: () => {
          throw new Error('render bug')
        }
      }
    )
  )
  t.equal(out.text, 'The answer is 42.')
  sandbox.restore()
  t.end()
})

test('turnStream: done.text wins when it differs from the deltas (the renderer is told)', async (t) => {
  const svc = makeService()
  const seen = []
  const body = frame('delta', { text: 'Draft' }) + frame('done', { text: 'Final', usage: {} })
  const out = await withFetch(sseFetch(body).fetch, () =>
    svc.turnStream({ content: 'q' }, { onDelta: (d, full) => seen.push([d, full]) })
  )
  t.equal(out.text, 'Final')
  t.deepEqual(seen.at(-1), ['', 'Final'])
  sandbox.restore()
  t.end()
})

test('turnStream: no active workspace → throws before any request', async (t) => {
  const svc = makeService({ workspaceId: null })
  const fake = sseFetch(HAPPY)
  try {
    await withFetch(fake.fetch, () => svc.turnStream({ content: 'q' }))
    t.fail('should throw')
  } catch (e) {
    t.match(String(e.message), /no active workspace/)
  }
  t.equal(fake.calls.length, 0)
  sandbox.restore()
  t.end()
})

test('turnStream: an explicit workspaceId routes the request', async (t) => {
  const svc = makeService()
  const fake = sseFetch(HAPPY)
  await withFetch(fake.fetch, () => svc.turnStream({ content: 'q' }, { workspaceId: 'ws-other' }))
  t.ok(fake.calls[0].url.endsWith('/core/agents/workspaces/ws-other/turn'))
  sandbox.restore()
  t.end()
})

test('turnStream: a network failure before the response rejects NETWORK_UNREACHABLE (no retry)', async (t) => {
  const svc = makeService()
  let calls = 0
  const fake = async () => {
    calls += 1
    throw new TypeError('Failed to fetch')
  }
  try {
    await withFetch(fake, () => svc.turnStream({ content: 'q' }))
    t.fail('should reject')
  } catch (e) {
    t.equal(e.code, NETWORK_UNREACHABLE)
  }
  t.equal(calls, 1, 'a streamed POST is never retried — it spends')
  sandbox.restore()
  t.end()
})

test('turn and turnStream build the same body (one builder)', (t) => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_requestExternal').resolves({ success: true, data: { text: 'x' } })
  const payload = { content: 'hello', system: 's', systemRef: 'r', allowTools: false }
  return svc.turn(payload).then(() => {
    const [, init] = req.firstCall.args
    t.deepEqual(init.body, svc._turnBody(payload))
    t.deepEqual(init.body, {
      content: 'hello',
      system: 's',
      systemRef: 'r',
      allowTools: false,
      modelMode: 'auto'
    })
    sandbox.restore()
    t.end()
  })
})
