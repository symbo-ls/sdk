/* eslint-disable no-continue */
// Utilities to compute stable key ordering for parent objects impacted by changes

function isObjectLike (val) {
  return val && typeof val === 'object' && !Array.isArray(val)
}

function normalizePath (path) {
  if (Array.isArray(path)) {return path}
  if (typeof path === 'string') {return [path]}
  return []
}

export function getParentPathsFromTuples (tuples = []) {
  const seen = new Set()
  const parents = []
  const META_KEYS = new Set([
    'style', 'class', 'text', 'html', 'content', 'data', 'attr', 'state', 'scope',
    'define', 'on', 'extend', 'extends', 'childExtend', 'childExtends',
    'children', 'component', 'context', 'tag', 'key', '__order', 'if'
  ])

  for (let i = 0; i < tuples.length; i++) {
    const tuple = tuples[i]
    if (!Array.isArray(tuple) || tuple.length < 2) {continue}
    const path = normalizePath(tuple[1])
    if (!path.length) {continue}
    // Ignore schema containers entirely for parent order targets
    if (path[0] === 'schema') {continue}
    const immediateParent = path.slice(0, -1)
    if (immediateParent.length) {
      const key = JSON.stringify(immediateParent)
      if (!seen.has(key)) {
        seen.add(key)
        parents.push(immediateParent)
      }
    }

    // If the tuple points to a meta key (e.g. props/text), also include the container parent
    const last = path[path.length - 1]
    if (META_KEYS.has(last) && path.length >= 2) {
      const containerParent = path.slice(0, -2)
      if (containerParent.length) {
        const key2 = JSON.stringify(containerParent)
        if (!seen.has(key2)) {
          seen.add(key2)
          parents.push(containerParent)
        }
      }
    }
    // Additionally include container parents for any meta segment in the path
    for (let j = 0; j < path.length; j++) {
      const seg = path[j]
      if (!META_KEYS.has(seg)) { continue }
      const containerParent2 = path.slice(0, j)
      if (!containerParent2.length) { continue }
      const key3 = JSON.stringify(containerParent2)
      if (!seen.has(key3)) {
        seen.add(key3)
        parents.push(containerParent2)
      }
    }
  }

  return parents
}

/**
 * Compute ordered key arrays for each parent path using the provided root state's getByPath.
 *
 * @param {Object} root - Root state with a getByPath(pathArray) method
 * @param {Array<Array<string>>} parentPaths - Array of parent paths to inspect
 * @returns {Array<{ path: string[], keys: string[] }>} orders
 */
export function computeOrdersFromState (root, parentPaths = []) {
  if (!root || typeof root.getByPath !== 'function') {return []}

  const orders = []
  const EXCLUDE_KEYS = new Set(['__order'])

  for (let i = 0; i < parentPaths.length; i++) {
    const parentPath = parentPaths[i]
    const obj = (() => {
      try { return root.getByPath(parentPath) } catch { return null }
    })()

    if (!isObjectLike(obj)) {continue}

    const keys = Object.keys(obj).filter(k => !EXCLUDE_KEYS.has(k))
    orders.push({ path: parentPath, keys })
  }

  return orders
}

/**
 * Convenience helper to derive orders directly from tuples and a root state.
 */
// --- Schema `code` parsing helpers ---
function normaliseSchemaCode (code) {
  if (typeof code !== 'string' || !code.length) { return '' }
  // Replace custom placeholders back to actual characters
  return code
    .replaceAll('/////n', '\n')
    .replaceAll('/////tilde', '`')
}

function parseExportedObject (code) {
  const src = normaliseSchemaCode(code)
  if (!src) { return null }
  const body = src.replace(/^\s*export\s+default\s*/u, 'return ')
  try {
    // eslint-disable-next-line no-new-func
    return new Function(body)()
  } catch {
    return null
  }
}

function extractTopLevelKeysFromCode (code) {
  const obj = parseExportedObject(code)
  if (!obj || typeof obj !== 'object') { return [] }
  return Object.keys(obj)
}

export function computeOrdersForTuples (root, tuples = []) {
  // Pre-scan tuples to collect child keys that will be added/updated for each
  // container object. This lets us include keys created in the same batch even
  // if they are not yet present in the state object when we compute orders.
  const pendingChildrenByContainer = new Map()
  for (let i = 0; i < tuples.length; i++) {
    const t = tuples[i]
    if (!Array.isArray(t)) { continue }
    const [action, path] = t
    const p = normalizePath(path)
    if (!Array.isArray(p) || p.length < 2) { continue }
    // Ignore schema edits here – we want actual data container child keys
    if (p[0] === 'schema') { continue }

    // Treat the immediate parent as the container and the final segment as the
    // child key, regardless of depth. This ensures nested containers such as
    // ['components', 'Comp1', 'MainContent', 'TXButton'] correctly record
    // 'TXButton' as a child of ['components', 'Comp1', 'MainContent'].
    const containerPath = p.slice(0, -1)
    const childKey = p[p.length - 1]
    const key = JSON.stringify(containerPath)
    if (!pendingChildrenByContainer.has(key)) {
      pendingChildrenByContainer.set(key, new Set())
    }
    // We only track updates/sets; deletes need not appear in the desired order
    if (action === 'update' || action === 'set') {
      pendingChildrenByContainer.get(key).add(childKey)
    }
  }

  // 1) Prefer code-derived order for corresponding data container when schema 'code' present
  const preferredOrderMap = new Map()
  for (let i = 0; i < tuples.length; i++) {
    const t = tuples[i]
    if (!Array.isArray(t)) {continue}
    const [action, path, value] = t
    const p = normalizePath(path)
    if (action !== 'update' || !Array.isArray(p) || p.length < 3) {continue}
    if (p[0] !== 'schema') {continue}
    const [, type, key] = p
    const containerPath = [type, key]
    const uses = value && Array.isArray(value.uses) ? value.uses : null
    const code = value && value.code

    // Resolve present keys from state
    const obj = (() => {
      try { return root && typeof root.getByPath === 'function' ? root.getByPath(containerPath) : null } catch { return null }
    })()
    if (!obj) {continue}
    const present = new Set(Object.keys(obj))
    const EXCLUDE_KEYS = new Set(['__order'])

    // Try to parse key order from schema.code
    const codeKeys = extractTopLevelKeysFromCode(code)
    let resolved = []
    // Keys eligible for ordering are those already present OR being added in
    // this same batch of tuples under the same container.
    const pendingKey = JSON.stringify(containerPath)
    const pendingChildren = pendingChildrenByContainer.get(pendingKey) || new Set()
    const eligible = new Set([...present, ...pendingChildren])

    if (Array.isArray(codeKeys) && codeKeys.length) {
      resolved = codeKeys.filter(k => eligible.has(k) && !EXCLUDE_KEYS.has(k))
    }
    if (Array.isArray(uses) && uses.length) {
      for (let u = 0; u < uses.length; u++) {
        const keyName = uses[u]
        if (eligible.has(keyName) && !EXCLUDE_KEYS.has(keyName) && !resolved.includes(keyName)) {
          resolved.push(keyName)
        }
      }
    }
    // Ensure any pending children not referenced by code/uses still appear
    // after code/uses-derived order, preserving stability.
    if (pendingChildren.size) {
      for (const child of pendingChildren) {
        if (!EXCLUDE_KEYS.has(child) && !resolved.includes(child)) {
          resolved.push(child)
        }
      }
    }

    if (resolved.length) {
      preferredOrderMap.set(JSON.stringify(containerPath), { path: containerPath, keys: resolved })
    }
  }

  // 2) Include immediate parent paths from tuples (excluding schema paths)
  const parents = getParentPathsFromTuples(tuples)

  // 3) Build final orders: prefer schema-derived order when available, otherwise infer from state
  const orders = []
  const seen = new Set()

  // Add preferred orders first
  preferredOrderMap.forEach(v => {
    const k = JSON.stringify(v.path)
    if (!seen.has(k)) { seen.add(k); orders.push(v) }
  })

  // Add remaining parents with state-derived order
  const fallbackOrders = computeOrdersFromState(root, parents)
  for (let i = 0; i < fallbackOrders.length; i++) {
    const v = fallbackOrders[i]
    const k = JSON.stringify(v.path)
    if (seen.has(k)) { continue }
    // Merge in any pending children (for containers without schema edits)
    const pending = pendingChildrenByContainer.get(k)
    if (pending && pending.size) {
      const existingKeys = v.keys
      const existingSet = new Set(existingKeys)

      // Meta keys such as 'props' and 'text' should typically stay at the end
      // of the order. When inserting brand-new children we try to place them
      // before the first meta key so that structural children appear first.
      const META_KEYS = new Set([
        'style', 'class', 'text', 'html', 'content', 'data', 'attr', 'state', 'scope',
        'define', 'on', 'extend', 'extends', 'childExtend', 'childExtends',
        'children', 'component', 'context', 'tag', 'key', '__order', 'if'
      ])

      let firstMetaIndex = existingKeys.length
      for (let j = 0; j < existingKeys.length; j++) {
        if (META_KEYS.has(existingKeys[j])) {
          firstMetaIndex = j
          break
        }
      }

      for (const child of pending) {
        if (existingSet.has(child)) { continue }
        const insertIndex = firstMetaIndex
        existingKeys.splice(insertIndex, 0, child)
        existingSet.add(child)
        // Keep subsequent new children grouped together in front of meta keys
        firstMetaIndex++
      }
    }
    seen.add(k)
    orders.push(v)
  }

  return orders
}


