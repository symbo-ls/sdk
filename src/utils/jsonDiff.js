// Lightweight JSON diff & patch helpers for CollabClient
// Each op: { action: 'set' | 'del', path: [...string], value?: any }

// helper functions
function isPlainObject (o) {
  return o && typeof o === 'object' && !Array.isArray(o)
}

function deepEqual (a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch (err) {
    console.warn('deepEqual error', err)
    return false
  }
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