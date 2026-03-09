import { logger } from '../utils/logger.js'

// Ensure we always reuse a single instance even if this file is evaluated
// multiple times from different bundle copies or with differing specifiers.
const getGlobalBus = () => {
  if (globalThis.__SMBLS_ROOT_BUS__) {
    return globalThis.__SMBLS_ROOT_BUS__
  }

  // Stores arrays of handlers for each event
  const events = {}

  // Stores the last payload emitted for each event so that late subscribers
  // can receive the most recent value immediately.
  const lastPayloads = {}

  const bus = {
    on (event, handler) {
      (events[event] ||= []).push(handler)

      // If we already have a payload for this event (it was emitted before the
      // listener subscribed), deliver it immediately so late subscribers do
      // not miss any state.
      if (Object.hasOwn(lastPayloads, event)) {
        try {
          handler(lastPayloads[event])
        } catch (err) {
          logger.error('[rootBus] handler error for (replay)', event, err)
        }
      }
    },

    off (event, handler) {
      const list = events[event]
      if (!list) {return}
      const idx = list.indexOf(handler)
      if (idx !== -1) {list.splice(idx, 1)}
    },

    emit (event, payload) {
      // Remember the last payload for future late subscribers.
      lastPayloads[event] = payload

      const list = events[event]
      if (!list || !list.length) {return}
      // copy to avoid mutation during iteration
      list.slice().forEach(fn => {
        try {
          fn(payload)
        } catch (err) {
          logger.error('[rootBus] handler error for', event, err)
        }
      })
    }
  }

  // expose for debugging if needed
  Object.defineProperty(bus, '_listeners', {
    value: events,
    enumerable: false
  })

  globalThis.__SMBLS_ROOT_BUS__ = bus
  return bus
}

export const rootBus = getGlobalBus()

export default rootBus