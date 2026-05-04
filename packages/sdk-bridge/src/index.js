// @symbo.ls/sdk-bridge
// Abstract federation primitive — registry + client cache + storage.
// Knows nothing about Supabase or any specific backend; supply your own
// `buildClient(cfg)` to plug it in. For Supabase consumers see
// @symbo.ls/sdk-supabase-bridge.

export { createRegistry } from './registry.js'
export { parentDomain, readCookie, writeCookie } from './cookies.js'
export { readStorage, writeStorage, clearStorage } from './storage.js'
