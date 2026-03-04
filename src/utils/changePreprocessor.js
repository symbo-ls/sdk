
import { diffJson } from './jsonDiff.js'
import { computeOrdersForTuples } from './ordering.js'

function isPlainObject (val) {
  return val && typeof val === 'object' && !Array.isArray(val)
}

function getByPathSafe (root, path) {
  if (!root || typeof root.getByPath !== 'function') { return null }
  try { return root.getByPath(path) } catch { return null }
}

// Given the original high-level tuples and a fully qualified path, resolve the
// "next" value that the change set intends to write at that path.
// This walks tuples from last to first so that later changes win, and supports
// nested paths where the tuple only targets a parent container, e.g.:
//   ['update', ['components', 'CanvasLogoDropdown'], { ... }]
// for a granular path like:
//   ['components', 'CanvasLogoDropdown', 'ProjectNav', 'ListInDropdown', 'children']
function resolveNextValueFromTuples (tuples, path) {
  if (!Array.isArray(tuples) || !Array.isArray(path)) { return null }

  // Walk from the end to honour the latest change
  for (let i = tuples.length - 1; i >= 0; i--) {
    const t = tuples[i]
    if (!Array.isArray(t) || t.length < 3) {
      // eslint-disable-next-line no-continue
      continue
    }
    const [action, tuplePath, tupleValue] = t
    if ((action !== 'update' && action !== 'set') || !Array.isArray(tuplePath)) {
      // eslint-disable-next-line no-continue
      continue
    }
    if (tuplePath.length > path.length) {
      // eslint-disable-next-line no-continue
      continue
    }

    // Ensure tuplePath is a prefix of the requested path
    let isPrefix = true
    for (let j = 0; j < tuplePath.length; j++) {
      if (tuplePath[j] !== path[j]) {
        isPrefix = false
        break
      }
    }
    if (!isPrefix) {
      // eslint-disable-next-line no-continue
      continue
    }

    // Direct match: the tuple already targets the exact path
    if (tuplePath.length === path.length) {
      return tupleValue
    }

    // Nested match: drill into the tuple value using the remaining segments
    let current = tupleValue
    for (let j = tuplePath.length; j < path.length; j++) {
      if (current == null) { return null }
      current = current[path[j]]
    }
    if (current !== null) {
      return current
    }
  }

  return null
}

/**
 * Preprocess broad project changes into granular changes and ordering metadata.
 * - Expands top-level object updates (e.g. ['update', ['components'], {...}])
 *   into fine-grained ['update'|'delete', [...], value] tuples using a diff
 *   against the current state when available
 * - Preserves schema paths as-is
 * - Filters out explicit deletes targeting __order keys
 * - Appends any extra tuples from options.append
 * - Computes stable orders for impacted parent containers
 * - IMPORTANT: When the tuple represents creation of a brand-new entity
 *   (e.g. ['update', ['components', key], {...}] where the path did not exist
 *   before, or the corresponding ['schema', ...] path is new), we DO NOT
 *   expand it into many granular changes. We keep the original change to avoid
 *   generating noisy diffs for creates.
 */
export function preprocessChanges (root, tuples = [], options = {}) {
  const expandTuple = (t) => {
    const [action, path, value] = t || []
    const isSchemaPath = Array.isArray(path) && path[0] === 'schema'
    const isFilesPath = Array.isArray(path) && path[0] === 'files'
    if (action === 'delete') { return [t] }

    const canConsiderExpansion = (
      action === 'update' &&
      Array.isArray(path) &&
      (
        path.length === 1 ||
        path.length === 2 ||
        (isSchemaPath && path.length === 3)
      ) &&
      isPlainObject(value)
    )
    if (!canConsiderExpansion || isFilesPath || (value && value.type === 'files')) { return [t] }

    // Detect brand-new entity creation:
    // - Non-schema entities typically come as ['update', [type, key], {...}]
    // - Schema entries as ['update', ['schema', type, key], {...}]
    // If the exact path does not exist yet, treat it as a "create" operation and
    // do NOT expand into granular leaf updates.
    const prevRaw = getByPathSafe(root, path)
    const isCreatePath = (
      (Array.isArray(path)) &&
      action === 'update' &&
      (
        // e.g. ['update', ['components', 'NewKey'], {...}]
        (!isSchemaPath && path.length === 2) ||
        // e.g. ['update', ['schema', 'components', 'NewKey'], {...}]
        (isSchemaPath && path.length === 3)
      ) &&
      (prevRaw === null || typeof prevRaw === 'undefined')
    )
    if (isCreatePath) { return [t] }

    const prev = prevRaw || {}
    const next = value || {}
    if (!isPlainObject(prev) || !isPlainObject(next)) { return [t] }

    const ops = diffJson(prev, next, [])
    // If diff yields no nested ops, preserve the original tuple as a fallback
    // (e.g. when value equality or missing previous state prevents expansion).
    if (!ops.length) { return [t] }

    const out = []
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]
      const fullPath = [...path, ...op.path]
      const last = fullPath[fullPath.length - 1]
      if (op.action === 'set') {
        out.push(['update', fullPath, op.value])
      } else if (op.action === 'del') {
        if (last !== '__order') { out.push(['delete', fullPath]) }
      }
    }
    // Prefer granular leaf operations only to minimize payload duplication.
    return out
  }

  const minimizeTuples = (input) => {
    const out = []
    const seen = new Set()
    for (let i = 0; i < input.length; i++) {
      const expanded = expandTuple(input[i])
      for (let k = 0; k < expanded.length; k++) {
        const tuple = expanded[k]
        const isDelete = Array.isArray(tuple) && tuple[0] === 'delete'
        const isOrderKey = (
          isDelete &&
          Array.isArray(tuple[1]) &&
          tuple[1][tuple[1].length - 1] === '__order'
        )
        if (!isOrderKey) {
          const key = JSON.stringify(tuple)
          if (!seen.has(key)) { seen.add(key); out.push(tuple) }
        }
      }
    }
    return out
  }

  const granularChanges = (() => {
    try {
      const res = minimizeTuples(tuples)
      if (options.append && options.append.length) { res.push(...options.append) }
      return res
    } catch {
      // Fallback to original tuples if anything goes wrong
      return Array.isArray(tuples) ? tuples.slice() : []
    }
  })()

  const hydratedGranularChanges = granularChanges.map(t => {
    if (!Array.isArray(t) || t.length < 3) { return t }
    const [action, path] = t
    if ((action !== 'update' && action !== 'set') || !Array.isArray(path)) {
      return t
    }

    const nextValue = resolveNextValueFromTuples(tuples, path)
    if (nextValue === null) {
      return t
    }

    return [action, path, nextValue]
  })

  // Base orders from granular changes/state
  const baseOrders = computeOrdersForTuples(root, hydratedGranularChanges)

  // Prefer explicit order for containers updated via ['update', [type], value] or ['update', [type, key], value]
  const preferOrdersMap = new Map()
  for (let i = 0; i < tuples.length; i++) {
    const t = tuples[i]
    if (!Array.isArray(t) || t.length < 3) {
      // eslint-disable-next-line no-continue
      continue
    }
    const [action, path, value] = t
    const isFilesPath = Array.isArray(path) && path[0] === 'files'
    if (
      action !== 'update' ||
      !Array.isArray(path) ||
      (path.length !== 1 && path.length !== 2) ||
      !isPlainObject(value) ||
      isFilesPath ||
      (value && value.type === 'files')
    ) {
      // eslint-disable-next-line no-continue
      continue
    }
    const keys = Object.keys(value).filter(k => k !== '__order')
    const key = JSON.stringify(path)
    preferOrdersMap.set(key, { path, keys })
  }

  const mergedOrders = []
  const seen = new Set()
  // Add preferred top-level orders first
  preferOrdersMap.forEach((v, k) => { seen.add(k); mergedOrders.push(v) })
  // Add remaining base orders
  for (let i = 0; i < baseOrders.length; i++) {
    const v = baseOrders[i]
    const k = JSON.stringify(v.path)
    if (!seen.has(k)) { seen.add(k); mergedOrders.push(v) }
  }

  return { granularChanges: hydratedGranularChanges, orders: mergedOrders }
}
