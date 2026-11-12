// Helpers for services that load on their first call (`lazyServices: true`,
// see src/sdk.js and src/services/registry.js).
import { logger } from './logger.js'

// Error codes a caller can branch on. The messages name the service.
export const SDK_SERVICE_UNKNOWN = 'SDK_SERVICE_UNKNOWN'
export const SDK_SERVICE_LOAD_FAILED = 'SDK_SERVICE_LOAD_FAILED'
export const SDK_NOT_INITIALIZED = 'SDK_NOT_INITIALIZED'
export const SDK_DESTROYED = 'SDK_DESTROYED'

const _codedError = (code, service, message, cause) => {
  const err = cause === undefined ? new Error(message) : new Error(message, { cause })
  err.code = code
  err.service = service
  return err
}

// Same text getService() has always thrown, so a log line reads the same.
export const unknownServiceError = (name) =>
  _codedError(SDK_SERVICE_UNKNOWN, name, `Service '${name}' not found`)

export const notInitializedError = (name) =>
  _codedError(
    SDK_NOT_INITIALIZED,
    name,
    `Service '${name}' not found: sdk.initialize() has not run`
  )

export const destroyedError = (name) =>
  _codedError(SDK_DESTROYED, name, `Service '${name}' was not built: the SDK was destroyed`)

// A chunk that failed to load (offline, a deploy replaced the file, an
// adblocker). The cause keeps the bundler's own error.
export const loadFailedError = (name, cause) =>
  _codedError(
    SDK_SERVICE_LOAD_FAILED,
    name,
    `Service '${name}' failed to load: ${cause?.message || cause}`,
    cause
  )

const _stopQuietly = (handle) => {
  try {
    if (typeof handle === 'function') handle()
    else if (typeof handle?.unsubscribe === 'function') handle.unsubscribe()
  } catch (_) {
    // A stop function that throws must not break the caller's teardown.
  }
}

/**
 * A stop handle that exists BEFORE the subscription does.
 *
 * `pending` resolves to the real stop handle once the service has loaded and
 * the real subscribe ran. The returned function can be called at any time:
 * before that, it cancels the subscription as soon as it starts; after that,
 * it stops it. A failed load logs one warning and leaves a no-op handle —
 * the same fail-soft contract every subscribe method of the SDK has.
 *
 * @param {Promise<Function|{unsubscribe: Function}>} pending
 * @param {string} label  method name, for the warning
 * @returns {Function & { unsubscribe: Function }}
 */
export const deferredHandle = (pending, label = 'subscription') => {
  let real = null
  let stopped = false
  Promise.resolve(pending).then(
    (handle) => {
      if (stopped) _stopQuietly(handle)
      else real = handle
    },
    (err) => {
      logger.warn(`[sdk.${label}] could not start:`, err?.message || err)
    }
  )
  const stop = () => {
    stopped = true
    const handle = real
    real = null
    _stopQuietly(handle)
  }
  stop.unsubscribe = stop
  return stop
}
