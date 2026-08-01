// Yjs-dependent op application, split out of jsonDiff.js so the eager
// service graph (CollabService → changePreprocessor → jsonDiff) no longer
// drags yjs (+ lib0 + the buffer polyfill) into consumers' initial bundles.
// Only the lazily-loaded CollabClient imports this module
// (workspace bundle-split T2).
import * as Y from 'yjs'
import { isPlainObject } from './jsonDiff.js'

// Retrieve the shared root map. We deliberately avoid creating a nested
// "root -> root" structure that previously caused an ever-growing tree.
function getRootMap (ydoc) {
  // `getMap()` lazily initialises the map if it does not yet exist, so the
  // returned instance is always defined.
  return ydoc.getMap('root')
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
