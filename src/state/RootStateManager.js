import * as utils from '@domql/utils'
import { rootBus } from './rootEventBus.js'

const { isFunction } = utils.default || utils

export class RootStateManager {
  constructor(rootState) {
    this._rootState = rootState
  }

  /**
   * Apply change tuples to the root state using the built-in setPathCollection
   * of Symbo.ls APP state tree.
   *
   * @param {Array} changes – eg. ['update', ['foo'], 'bar']
   * @param {Object} opts   – forwarded to setPathCollection
   */
  async applyChanges(changes = [], opts = {}) {
    if (!this._rootState || !isFunction(this._rootState.setPathCollection)) {
      return
    }

    const result = await this._rootState.setPathCollection(changes, {
      preventUpdate: true,
      ...opts
    })

    // Identify library component mutations and notify UI once per batch
    // try {
    //   const changedKeys = new Set()
    //   changes.forEach(tuple => {
    //     const [, path = []] = tuple
    //     if (!Array.isArray(path) || !path.length) {
    //       return
    //     }

    //     // Direct component value: ['components', key]
    //     if (
    //       ['components', 'pages'].includes(path[0]) &&
    //       typeof path[1] === 'string'
    //     ) {
    //       changedKeys.add(path[1])
    //     }

    //     // Component schema: ['schema', 'components', key, ...]
    //     if (
    //       path[0] === 'schema' &&
    //       ['components', 'pages'].includes(path[1]) &&
    //       typeof path[2] === 'string'
    //     ) {
    //       changedKeys.add(path[2])
    //     }
    //   })

    //   if (changedKeys.size && !opts.skipComponentsChangedEvent) {
    //     console.log('emit components:changed', [...changedKeys])
    //     rootBus.emit('components:changed', [...changedKeys])
    //   }
    // } catch (err) {
    //   // Do not interrupt the main apply flow if notification fails
    //   console.error('[RootStateManager] emit components:changed failed', err)
    // }

    return result
  }

  setVersion(v) {
    if (this._rootState) {
      this._rootState.version = v
    }
  }

  get root() {
    return this._rootState
  }
}
