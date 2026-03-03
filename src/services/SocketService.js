import { connect, send, disconnect } from '@symbo.ls/socket/client.js'
import { BaseService } from './BaseService.js'

import * as utils from '@domql/utils'
import { router } from '@symbo.ls/router'
import environment from '../config/environment.js'

const { deepStringify, deepDestringify, isString } = utils.default || utils

export class SocketService extends BaseService {
  constructor (config) {
    super(config)
    this._socket = null
    this._reconnectAttempts = 0
    this._maxReconnectAttempts = config?.maxReconnectAttempts || 5
    this._reconnectDelay = config?.reconnectDelay || 1000
    this._handlers = new Map()
    this._sessionId = Math.random()

    this._ignoreSync = [
      'userId',
      'username',
      'usersName',
      'email',
      'projects',
      'feedbacks',
      'userRoles',
      'loading',
      'appKey',
      'projectName',
      'followingUser',
      'activeProject',
      'user',
      'sessionId',
      'clients'
    ]
  }

  init () {
    try {
      const { _context, _options } = this
      const socketUrl = environment.socketUrl || _options.socketUrl

      if (!socketUrl) {
        throw new Error('Socket URL is required')
      }

      this._info = {
        config: {
          url: socketUrl,
          hasToken: Boolean(_context.authToken),
          status: 'initializing'
        }
      }

      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  connect () {
    try {
      // Check if already connected or connecting
      if (
        this._socket &&
        ['connected', 'connecting'].includes(this._info?.config?.status)
      ) {
        console.warn(
          'Socket connection already exists:',
          this._info?.config?.status
        )
        return true
      }

      const { _context } = this

      if (!_context.appKey) {
        throw new Error('App key is required')
      }

      // Update status to connecting before attempting connection
      this._updateStatus('connecting')

      const config = {
        source: 'platform',
        userId: _context.user?.id,
        socketUrl: this._info.config.url,
        location: window.location.host,
        // onConnect: () => {
        //   console.log('waz')
        // },
        onChange: this._handleMessage.bind(this),
        sessionId: this._sessionId,
        usersName: _context.user?.name,
        route: window.location.pathname,
        onDisconnect: this._handleDisconnect.bind(this)
      }

      // If a previous socket exists but wasn't properly cleaned up, destroy it
      if (this._socket) {
        this.destroy()
      }

      this._socket = connect(_context.appKey, config)
      this._updateStatus('connected')

      if (environment.isDevelopment) {
        console.log('Socket connection established:', {
          appKey: _context.appKey,
          userId: _context.user?.id,
          sessionId: this._sessionId,
          url: this._info.config.url
        })
      }

      return true
    } catch (error) {
      this._updateStatus('failed')
      console.error('Socket connection failed:', error)
      throw new Error(`Socket connection failed: ${error.message}`)
    }
  }

  send (type, data, opts = {}) {
    this._requireReady()

    if (!this._socket) {
      throw new Error('Socket is not connected')
    }

    const payload = {
      sessionId: this._sessionId,
      userId: this._context.user?.id,
      usersName: this._context.user?.name,
      ...data
    }

    send.call(
      this._socket,
      type,
      opts.useDeepStringify ? deepStringify(payload) : payload
    )
  }

  _handleMessage (event, data) {
    try {
      const d = isString(data) ? deepDestringify(JSON.parse(data)) : data
      if (this._sessionId === d.sessionId) {
        return
      }

      const handlers = this._handlers.get(event)
      if (handlers) {
        handlers.forEach(handler => handler(d))
      }

      // Handle specific events
      switch (event) {
        case 'change':
          this._handleChangeEvent(d)
          break
        case 'clients':
          this._handleClientsEvent(d)
          break
        case 'route':
          this._handleRouteEvent(d)
          break
        default:
          break
      }
    } catch (error) {
      this._setError(new Error(`Failed to handle message: ${error.message}`))
    }
  }

  _handleChangeEvent (data) {
    const { type, changes, version } = data
    if (version) {
      this._context.state.version = version
    }
    if (changes) {
      window.requestAnimationFrame(async () => {
        await this._context.state.setPathCollection(changes, {
          preventReplace: type === 'canvas',
          preventUpdate: true,
          fromSocket: true,
          userId: data.userId,
          changes
        })
      })
    }

    // monaco updates
    // if (data.canvas) {
    //   const { clients } = data.canvas
    //   const [firstClientKey] = Object.keys(clients)
    //   const monaco =
    //     clients && clients[firstClientKey] && clients[firstClientKey].monaco
    //   if (monaco) {
    //     const Canvas =
    //       this._context.element && this._context.element.getCanvas()
    //     if (Canvas) {
    //       Canvas.Chosen.EditorPanels.update({}, { forceMonacoUpdate: true })
    //     }
    //   }
    //   return
    // }
  }

  _handleClientsEvent (data) {
    const { root } = this._context.state

    root.replace(
      { clients: data },
      {
        fromSocket: true,
        preventUpdate: true
      }
    )
  }

  _handleRouteEvent (data) {
    const { element } = this._context
    const { state } = this._context

    if (data.userId && data.type === 'routeChanged') {
      const isModalOpen = this.getWindow('modal')
      const isFollowing = state.followingUser === data.userId
      const isRouteSyncEnabled =
        element.getUserSettings('presentMode') && data.userId === state.userId

      if ((isFollowing || isRouteSyncEnabled) && !isModalOpen) {
        router(
          data.route,
          element.__ref.root,
          {},
          {
            fromSocket: true,
            updateStateOptions: {
              fromSocket: true,
              preventStateUpdateListener: 1 // !isModalRoute(data.route, element)
            }
          }
        )
      }
    } else if (data.reload) {
      window.location.reload()
    } else if (data.route && data.type === 'routeForced') {
      router(
        data.route,
        element.__ref.root,
        {},
        {
          fromSocket: true,
          updateStateOptions: {
            fromSocket: true
          }
        }
      )
    } else if (data.componentKey) {
      if (!element.getData('components')[data.componentKey]) {
        return
      }
      element.activateSelected(data.componentKey)
    }
  }

  _handleDisconnect () {
    this._updateStatus('disconnected')
    this._handleReconnect()
  }

  _handleReconnect () {
    if (this._reconnectAttempts < this._maxReconnectAttempts) {
      this._reconnectAttempts++
      this._updateStatus('reconnecting')

      setTimeout(() => {
        try {
          const connected = this.connect()
          if (connected) {
            this._reconnectAttempts = 0
          } else {
            this._handleReconnect()
          }
        } catch (error) {
          console.error('Reconnection failed:', error)
          this._handleReconnect()
        }
      }, this._reconnectDelay * this._reconnectAttempts)
    } else {
      this._updateStatus('failed')
      this._setError(new Error('Max reconnection attempts reached'))
    }
  }

  _updateStatus (status) {
    this._info = {
      ...this._info,
      config: {
        ...this._info.config,
        status
      }
    }
  }

  destroy () {
    if (this._socket) {
      disconnect.call(this._socket)
      this._socket = null
    }
    this._handlers.clear()
    this._setReady(false)
  }

  reconnect () {
    this.destroy()
    this.connect()
  }

  _checkRequiredContext () {
    return Boolean(
      this._context?.appKey && this._context?.authToken && this._socket
    )
  }

  isReady () {
    if (this._checkRequiredContext()) {
      this._setReady(true)
    }

    return this._ready
  }
}
