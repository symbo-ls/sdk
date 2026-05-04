// Safe localStorage wrappers. Browser-only; no-op in SSR. Used by bridges
// to stash short-lived tokens, app-level prefs, and similar lightweight
// scalars without crashing on Node or in privacy-mode tabs.

export function readStorage (key) {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function writeStorage (key, value) {
  if (typeof window === 'undefined') return
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, String(value))
  } catch {}
}

export function clearStorage (key) {
  writeStorage(key, null)
}
