import test from 'tape'
import { openUserSocket, createSocketIoLoader } from '../../../utils/userSocket.js'
import { AuthService } from '../../AuthService.js'

// socket.io-client loads on the first `/user-socket` subscription
// (utils/userSocket.js), not when the SDK module loads. Offline: the io
// function is always a stand-in here.

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const makeSocket = () => ({
  listeners: {},
  emitted: [],
  disconnected: false,
  on (event, fn) {
    ;(this.listeners[event] ||= []).push(fn)
  },
  emit (event, payload) {
    this.emitted.push([event, payload])
  },
  removeAllListeners () {
    this.listeners = {}
  },
  disconnect () {
    this.disconnected = true
  }
})

const makeIo = () => {
  const calls = []
  const io = (url, opts) => {
    const socket = makeSocket()
    calls.push({ url, opts, socket })
    return socket
  }
  return { io, calls }
}

test('openUserSocket answers its stop function before socket.io has loaded', async (t) => {
  const { io, calls } = makeIo()
  let release
  const load = () => new Promise((resolve) => { release = () => resolve(io) })
  const seen = []
  const stop = openUserSocket({
    label: 't',
    baseUrl: 'http://api.test',
    token: 'tok',
    load,
    setup: (socket) => seen.push(socket)
  })
  t.equal(typeof stop, 'function', 'a stop function at once')
  await tick()
  t.equal(calls.length, 0, 'no socket before the load')
  release()
  await tick()
  t.equal(calls.length, 1, 'one socket after the load')
  t.equal(calls[0].url, 'http://api.test', 'api base url')
  t.equal(calls[0].opts.path, '/user-socket', 'the user socket namespace')
  t.equal(calls[0].opts.auth.token, 'tok', 'the token travels in auth')
  t.equal(seen[0], calls[0].socket, 'setup got the socket')
  t.equal(calls[0].socket.listeners.connect_error?.length, 1, 'connect_error listener')
  stop()
  t.ok(calls[0].socket.disconnected, 'stop disconnects')
  t.end()
})

test('openUserSocket: stop before the load means the socket never opens', async (t) => {
  const { io, calls } = makeIo()
  const stop = openUserSocket({ label: 't', baseUrl: 'u', token: 'k', load: async () => io, setup () {} })
  stop()
  await tick()
  t.equal(calls.length, 0, 'never opened')
  t.end()
})

test('openUserSocket: a failed load is fail-soft and the next subscription retries', async (t) => {
  const { io, calls } = makeIo()
  let attempts = 0
  const load = createSocketIoLoader(async () => {
    attempts++
    if (attempts === 1) throw new Error('chunk 404')
    return { io }
  })
  const stop1 = openUserSocket({ label: 't', baseUrl: 'u', token: 'k', load, setup () {} })
  await tick()
  t.equal(calls.length, 0, 'no socket after the failed load')
  t.doesNotThrow(() => stop1(), 'its stop is a no-op')
  openUserSocket({ label: 't', baseUrl: 'u', token: 'k', load, setup () {} })
  await tick()
  t.equal(attempts, 2, 'the loader imported again (no poisoned cache)')
  t.equal(calls.length, 1, 'the second subscription opened')
  t.end()
})

test('createSocketIoLoader: concurrent first calls share one import', async (t) => {
  const { io } = makeIo()
  let imports = 0
  const load = createSocketIoLoader(async () => {
    imports++
    return { io }
  })
  const [a, b] = await Promise.all([load(), load()])
  t.equal(imports, 1, 'one import')
  t.equal(a, io, 'resolves to io')
  t.equal(b, io, 'shared')
  t.end()
})

test('openUserSocket with an injected io opens synchronously, as before', (t) => {
  const { io, calls } = makeIo()
  openUserSocket({ label: 't', baseUrl: 'u', token: 'k', io, setup () {} })
  t.equal(calls.length, 1, 'opened in the same tick')
  t.end()
})

test('subscribePresence: sendCursor exists at once and reaches the socket once it is open', async (t) => {
  const { io, calls } = makeIo()
  const auth = new AuthService()
  auth._apiUrl = 'http://api.test'
  auth._tokenManager = { getAccessToken: () => 'tok' }
  auth._ioFactory = io
  const states = []
  const handle = auth.subscribePresence({ scope: 's1', userKey: 'u1' }, (s) => states.push(s))
  t.equal(typeof handle, 'function', 'stop function')
  t.equal(typeof handle.sendCursor, 'function', 'sendCursor on the handle')
  const socket = calls[0].socket
  socket.listeners['presence:sync'][0]({ scope: 's1', state: { u1: [{}] } })
  t.deepEqual(states, [{ u1: [{}] }], 'presence:sync for the scope reaches onSync')
  handle.sendCursor({ x: 1 })
  t.deepEqual(socket.emitted.at(-1), ['presence:cursor', { x: 1, scope: 's1', userKey: 'u1' }], 'cursor emitted with scope')
  handle()
  t.ok(socket.disconnected, 'stop disconnects')
  t.doesNotThrow(() => handle.sendCursor({ x: 2 }), 'sendCursor after stop is a no-op')
  t.end()
})

test('subscribeUserEvents: fail-soft without a token, handlers bound once open', (t) => {
  const { io, calls } = makeIo()
  const auth = new AuthService()
  auth._apiUrl = 'http://api.test'
  auth._tokenManager = { getAccessToken: () => null }
  auth._ioFactory = io
  t.equal(typeof auth.subscribeUserEvents({}), 'function', 'no token: a no-op stop')
  t.equal(calls.length, 0, 'no socket without a token')
  auth._tokenManager = { getAccessToken: () => 'tok' }
  const onOrg = () => {}
  auth.subscribeUserEvents({ 'active-org-changed': onOrg, ignored: 'x' })
  t.deepEqual(calls[0].socket.listeners['active-org-changed'], [onOrg], 'handler bound by event name')
  t.notOk(calls[0].socket.listeners.ignored, 'non-function handlers skipped')
  t.end()
})
