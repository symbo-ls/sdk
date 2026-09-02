import test from 'tape'
import sinon from 'sinon'
import { AiService } from '../../AiService.js'

// Image attachments on a workspace turn.
//
// The SDK is the hop that puts the pictures on the wire: the surface hands
// `attachments` to `dispatch`, and `_streamWorkspaceTurn` must copy them onto
// the message POST body. Two properties are pinned, and the second matters as
// much as the first:
//   1. attachments RIDE — the array reaches the POST body verbatim.
//   2. a text-only turn is BYTE-COMPATIBLE — the key is ABSENT, not an empty
//      array, so nothing about an existing turn changes shape.
//
// Same rig as the sibling staleConversation404 test: `_streamSSE` and
// `_requestExternal` are stubbed, so there is no network and no timers.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const dataUrl = `data:image/png;base64,${'A'.repeat(64)}`

const makeService = () => {
  const svc = new AiService()
  sandbox.stub(svc, '_activeWorkspaceId').returns('ws-1')
  const cacheKey = `symbols_ai_conversation_ws-1_${svc._planeTag()}`
  const store = { [cacheKey]: 'conv-1' }
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    }
  }
  sandbox.stub(svc, '_streamSSE').callsFake(() => () => {})
  const posts = []
  sandbox.stub(svc, '_requestExternal').callsFake((url, opts) => {
    if (opts.methodName === 'ai.appendMessage') {
      posts.push(opts.body)
      return Promise.resolve({
        assistantMessage: { _id: 'm2', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
      })
    }
    return Promise.resolve({ data: { id: 'conv-1' } })
  })
  return { svc, posts }
}

test('attachments ride the message POST body verbatim', async (t) => {
  t.plan(3)
  const { svc, posts } = makeService()
  const attachments = [{ name: 'shot.png', mime: 'image/png', size: 48, dataUrl }]

  svc._streamWorkspaceTurn({ content: 'what is this?', attachments }, {})
  await flush()

  t.equal(posts.length, 1, 'one message POST')
  t.deepEqual(posts[0].attachments, attachments, 'the array reaches the server untouched')
  t.equal(posts[0].content, 'what is this?', 'the text still rides beside it')
})

test('a text-only turn OMITS the key entirely — byte-compatible body', async (t) => {
  t.plan(2)
  const { svc, posts } = makeService()

  svc._streamWorkspaceTurn({ content: 'summarise this week' }, {})
  await flush()

  t.equal('attachments' in posts[0], false, 'no attachments key on a text-only turn')
  t.equal(posts[0].earlyAck, true, 'the rest of the body is unchanged')
})

test('an EMPTY attachments array is the same as none', async (t) => {
  t.plan(1)
  const { svc, posts } = makeService()

  svc._streamWorkspaceTurn({ content: 'hello', attachments: [] }, {})
  await flush()

  t.equal('attachments' in posts[0], false, 'an empty array never reaches the wire')
})

test('dispatch() carries attachments through to the turn', async (t) => {
  t.plan(1)
  const { svc, posts } = makeService()
  const attachments = [{ name: 'a.png', mime: 'image/png', size: 10, dataUrl }]

  svc.dispatch({ text: 'compare these', attachments }, {})
  await flush()

  t.deepEqual(
    posts[0].attachments,
    attachments,
    'dispatch does not lose the array on its way to _streamWorkspaceTurn'
  )
})
