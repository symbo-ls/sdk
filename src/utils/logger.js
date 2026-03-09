const isBrowser = typeof window !== 'undefined' && !!(typeof process === 'undefined' || (typeof process.versions === 'undefined' || !process.versions.node))

let _debug = false

export const setDebug = (value) => { _debug = value }

const noop = () => {}

export const logger = {
  get log () { return (_debug || isBrowser) ? console.log.bind(console) : noop },
  get warn () { return (_debug || isBrowser) ? console.warn.bind(console) : noop },
  get error () { return (_debug || isBrowser) ? console.error.bind(console) : noop }
}
