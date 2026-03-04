// Lightweight JSON diff & patch helpers for CollabClient
// Each op: { action: 'set' | 'del', path: [...string], value?: any }

// helper functions
function isPlainObject (o) {
  return o && typeof o === 'object' && !Array.isArray(o)
}

function deepEqual (a, b) {
  // Fast path for strict equality (handles primitives and same refs)
  if (Object.is(a, b)) { return true }

  // Functions: compare source text to detect semantic change
  if (typeof a === 'function' && typeof b === 'function') {
    try { return a.toString() === b.toString() } catch { return false }
  }

  // One is function and the other is not
  if (typeof a === 'function' || typeof b === 'function') { return false }

  // Dates
  if (a instanceof Date && b instanceof Date) { return a.getTime() === b.getTime() }

  // RegExp
  if (a instanceof RegExp && b instanceof RegExp) { return String(a) === String(b) }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { return false }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) { return false }
    }
    return true
  }

  // Objects (including plain objects when we get here)
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) { return false }
    for (let i = 0; i < aKeys.length; i++) {
      const key = aKeys[i]
      if (!Object.hasOwn(b, key)) { return false }
      if (!deepEqual(a[key], b[key])) { return false }
    }
    return true
  }

  // Fallback for different types
  return false
}

import * as Y from 'yjs'

// Retrieve the shared root map. We deliberately avoid creating a nested
// "root -> root" structure that previously caused an ever-growing tree.
function getRootMap (ydoc) {
  // `getMap()` lazily initialises the map if it does not yet exist, so the
  // returned instance is always defined.
  return ydoc.getMap('root')
}

// diff algorithm
export function diffJson (prev, next, prefix = []) {
  const ops = []
  const _prefix = Array.isArray(prefix) ? prefix : []

  // deletions
  for (const key in prev) {
    if (
      Object.hasOwn(prev, key) &&
      !(key in next)
    ) {
      ops.push({ action: 'del', path: [..._prefix, key] })
    }
  }

  // additions / updates
  for (const key in next) {
    if (Object.hasOwn(next, key)) {
      const pVal = prev?.[key]
      const nVal = next[key]

      if (isPlainObject(pVal) && isPlainObject(nVal)) {
        ops.push(...diffJson(pVal, nVal, [..._prefix, key]))
      } else if (!deepEqual(pVal, nVal)) {
        ops.push({ action: 'set', path: [..._prefix, key], value: nVal })
      }
    }
  }

  return ops
}

// apply ops to Yjs
export function applyOpsToJson (ops, ydoc) {
  if (!ydoc || !Array.isArray(ops) || !ops.length) { return }

  // Wrap modifications in a transaction so that we can tag them with the
  // special "remote" origin. This ensures that our local change listener
  // (`afterTransaction`) can safely ignore these updates and prevents
  // feedback loops where we would echo remote changes back to the server.
  ydoc.transact(() => {
    const root = getRootMap(ydoc)

    ops.forEach(op => {
      const { action, path = [], value } = op || {}
      if (!path.length) { return }

      let target = root

      // Traverse (or lazily create) intermediate maps.
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        let next = target.get(key)

        if (!(next instanceof Y.Map)) {
          // If the key is missing or not a Y.Map, replace it with a new map so
          // we have a consistent structure for nested updates.
          const fresh = new Y.Map()

          // Preserve any plain object that may have existed previously.
          if (isPlainObject(next)) {
            Object.entries(next).forEach(([k, v]) => fresh.set(k, v))
          }

          target.set(key, fresh)
          next = fresh
        }

        target = next
      }

      const last = path[path.length - 1]

      // Apply the leaf operation.
      if (action === 'set') {
        target.set(last, value)
      } else if (action === 'del') {
        target.delete(last)
      }
    })
  }, 'remote')
}