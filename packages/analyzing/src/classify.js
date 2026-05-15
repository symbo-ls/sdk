'use strict'

// Mirrors smbls/plugins/analyze/src/remote.js classifyEvent. Kept duplicate so
// the SDK can pre-classify manual captures (captureError → 'bug', etc.) without
// importing internal plugin paths.

export const LOG_TYPES = ['bug', 'network', 'log', 'verbose']

export const classifyEnvelope = (event) => {
  if (!event) return 'verbose'
  if (event.level === 'error' || event.type === 'error') return 'bug'
  if (event.type === 'network') return 'network'
  if (event.type === 'console') {
    return event.level === 'error' || event.level === 'warn' ? 'bug' : 'log'
  }
  if (event.level === 'warn') return 'bug'
  if (event.level === 'info') return 'log'
  return 'verbose'
}
