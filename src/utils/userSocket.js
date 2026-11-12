// The `/user-socket` connection that subscribeUserEvents, subscribePresence,
// subscribeWorkspaceCanvasLayout, subscribeWorkspaceFileCanvas and
// subscribeWorkspaceBuilds open — one copy of the transport options and the
// fail-soft rules instead of five.
//
// `socket.io-client` loads with `import()` on the first subscription, so a
// bundler that splits keeps it out of the entry file, and a page that never
// subscribes (a signed-out page) never downloads it. The IIFE build inlines
// it (esbuild bundles a literal `import()` when it does not split).
import { logger } from './logger.js'

/**
 * Build a loader for socket.io's `io` function. Concurrent calls share one
 * import; a failed import is forgotten, so the next call tries again.
 *
 * @param {() => Promise<object>} importer  `() => import('socket.io-client')`
 * @returns {() => Promise<Function>}
 */
export const createSocketIoLoader = (importer) => {
  let pending = null
  return () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(importer)
        .then((mod) => {
          const io = mod?.io || mod?.default?.io || mod?.default
          if (typeof io !== 'function') {
            throw new Error("socket.io-client has no 'io' export")
          }
          return io
        })
        .catch((err) => {
          pending = null
          throw err
        })
    }
    return pending
  }
}

export const loadSocketIo = createSocketIoLoader(() => import('socket.io-client'))

const userSocketOptions = (token) => ({
  path: '/user-socket',
  transports: ['websocket', 'polling'],
  auth: { token },
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000
})

/**
 * Open a `/user-socket` connection. Answers its stop function AT ONCE —
 * before socket.io has loaded — so a caller can bind it into a teardown
 * synchronously, as every subscribe method of the SDK always allowed.
 *
 * - `setup(socket)` runs once the socket exists: attach the listeners there.
 * - Stop before the socket exists: it is never opened.
 * - A socket.io load or construct failure logs one warning and leaves a
 *   no-op stop (fail-soft, as before). The next subscription tries again.
 * - `io` (a test seam, e.g. BuildsService `_ioFactory`): used as is, and the
 *   socket opens synchronously, as before this helper existed.
 *
 * @param {{ label: string, baseUrl: string, token: string,
 *   setup: (socket: object) => void, io?: Function,
 *   load?: () => Promise<Function> }} args
 * @returns {() => void} stop — removes the listeners and disconnects
 */
export const openUserSocket = ({ label, baseUrl, token, setup, io, load = loadSocketIo }) => {
  const open = (ioFn) => {
    let socket
    try {
      socket = ioFn(baseUrl, userSocketOptions(token))
    } catch (err) {
      logger.warn(`[sdk.${label}] socket init failed:`, err?.message || err)
      return () => {}
    }

    let loggedAuthFail = false
    socket.on('connect_error', (err) => {
      // The server disconnects unauthed clients on handshake — surface once
      // at warn so logged-out tabs don't spam the console as the client
      // retries.
      if (err?.message && !loggedAuthFail) {
        loggedAuthFail = true
        logger.warn(`[sdk.${label}] connect_error:`, err.message)
      }
    })

    const stop = () => {
      try {
        socket.removeAllListeners()
      } catch (_) {}
      try {
        socket.disconnect()
      } catch (_) {}
    }

    try {
      setup(socket)
    } catch (err) {
      stop()
      throw err
    }
    return stop
  }

  if (typeof io === 'function') return open(io)

  let stopped = false
  let stopOpen = null
  Promise.resolve()
    .then(load)
    .then(
      (ioFn) => {
        if (stopped) return
        try {
          stopOpen = open(ioFn)
        } catch (err) {
          logger.warn(`[sdk.${label}] socket setup failed:`, err?.message || err)
        }
      },
      (err) => {
        logger.warn(`[sdk.${label}] socket init failed:`, err?.message || err)
      }
    )
  return () => {
    stopped = true
    const stop = stopOpen
    stopOpen = null
    if (stop) stop()
  }
}
