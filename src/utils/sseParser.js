// A spec-shaped Server-Sent Events parser (WHATWG HTML, "event stream
// interpretation") for streams read over fetch().
//
// The two SSE readers in BaseService (`_streamPost`, `_streamSSE`) split on
// '\n' / '\n\n' and read only `data: ` with a space — enough for their own
// endpoints, but a CRLF proxy, a multi-line `data:` frame or a field written
// without the space breaks them. This one follows the spec:
//   - lines end on CRLF, LF or CR — a CR at a chunk's end waits for the next
//     chunk, in case it is the first half of a CRLF;
//   - a blank line dispatches the event; `:` lines are comments (heartbeats);
//   - `data:` lines join with '\n'; one space after the colon is dropped;
//   - a field with no colon is that field with an empty value;
//   - an event with no data lines is not dispatched;
//   - a leading byte-order mark is dropped;
//   - a frame left unterminated when the stream ends is discarded (end()).
//
// Chunk boundaries anywhere — inside a field, a CRLF or a multi-byte UTF-8
// character (readSseStream decodes with { stream: true }) — change nothing.

/**
 * @param {(event: { event: string, data: string, id: string }) => void} onEvent
 * @param {{ onComment?: (text: string) => void }} [options]
 * @returns {{ push: (text: string) => void, end: () => void }}
 */
export function createSseParser (onEvent, { onComment } = {}) {
  let buffer = ''
  let started = false
  let eventType = ''
  let dataLines = null
  let lastEventId = ''

  const dispatch = () => {
    const lines = dataLines
    const type = eventType
    dataLines = null
    eventType = ''
    if (!lines) return
    onEvent({ event: type || 'message', data: lines.join('\n'), id: lastEventId })
  }

  const line = (text) => {
    if (text === '') {
      dispatch()
      return
    }
    if (text[0] === ':') {
      if (onComment) onComment(text.slice(1).replace(/^ /, ''))
      return
    }
    const colon = text.indexOf(':')
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? '' : text.slice(colon + 1)
    if (value[0] === ' ') value = value.slice(1)
    if (field === 'event') eventType = value
    else if (field === 'data') (dataLines || (dataLines = [])).push(value)
    else if (field === 'id') {
      if (!value.includes('\0')) lastEventId = value
    }
    // `retry` and unknown fields: ignored (no reconnect here).
  }

  return {
    push (text) {
      if (!text) return
      buffer += text
      if (!started) {
        if (buffer[0] === '﻿') buffer = buffer.slice(1)
        started = buffer.length > 0
      }
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i]
        if (ch !== '\n' && ch !== '\r') continue
        if (ch === '\r' && i === buffer.length - 1) break // maybe half a CRLF
        line(buffer.slice(start, i))
        if (ch === '\r' && buffer[i + 1] === '\n') i++
        start = i + 1
      }
      buffer = buffer.slice(start)
    },
    // The stream ended: a lone CR is a line end; an unterminated frame is
    // discarded, as the spec says.
    end () {
      if (buffer.endsWith('\r')) line(buffer.slice(0, -1))
      buffer = ''
      dataLines = null
      eventType = ''
    }
  }
}

/**
 * Read an SSE body (a fetch Response.body) to its end, or until `onEvent`
 * returns `false`. Decodes UTF-8 across chunk boundaries. Always releases
 * the reader. Rejects with the reader's own error (an AbortError when the
 * request's signal fired).
 */
export async function readSseStream (body, onEvent, { onComment } = {}) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let stopped = false
  const parser = createSseParser(
    (event) => {
      if (stopped) return
      if (onEvent(event) === false) stopped = true
    },
    { onComment }
  )
  try {
    while (!stopped) {
      const { done, value } = await reader.read()
      if (done) {
        parser.push(decoder.decode())
        parser.end()
        break
      }
      parser.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    // cancel() returns a promise that rejects when the stream already
    // failed (an abort) — swallow it, or every aborted turn logs an
    // unhandled rejection.
    try {
      reader.cancel()?.catch?.(() => {})
    } catch (_) {}
  }
}
