// @symbo.ls/sdk-bridge
// Abstract federation primitive — registry + client cache + storage.
// Knows nothing about any specific backend; supply your own
// `buildClient(cfg)` to plug it in.

export { createRegistry } from './registry.js'
export { parentDomain, readCookie, writeCookie } from './cookies.js'
export { readStorage, writeStorage, clearStorage } from './storage.js'
