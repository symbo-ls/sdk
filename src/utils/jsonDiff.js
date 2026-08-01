// Lightweight JSON diff helpers for CollabClient + changePreprocessor.
// Each op: { action: 'set' | 'del', path: [...string], value?: any }
//
// NOTE: this module is reached EAGERLY (CollabService → changePreprocessor →
// diffJson), so it must stay free of heavyweight imports. The Yjs-dependent
// op application (applyOpsToJson) lives in ./yjsOps.js, which only the
// lazily-loaded CollabClient imports (workspace bundle-split T2).

// helper functions
export function isPlainObject (o) {
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