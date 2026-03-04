import test from 'tape'
import { TransportItemType } from '@grafana/faro-core'

import { TrackingService } from '../../src/services/TrackingService.js'
import environment from '../../src/config/environment.js'
import '../index.js'

const trackingService = global.globalSdk.getService('tracking')

const getRecords = () => global.__faroTestRecords
const resetRecords = () => {
  if (typeof global.__resetFaroTestRecords === 'function') {
    global.__resetFaroTestRecords()
  }
}

const wait = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

const waitForFlush = async () => {
  await wait(0)
}

const waitForCollectorDispatch = async () => {
  await wait(500)
}

const grafanaCollectorUrl =
  process.env.SDK_GRAFANA_COLLECTOR_URL ||
  process.env.SYMBOLS_APP_GRAFANA_URL ||
  environment.grafanaUrl ||
  global.globalSdk?.getService('tracking')?._runtimeConfig?.url ||
  null

const shouldSkipGrafanaCollectorTest = !grafanaCollectorUrl

test('TrackingService trackEvent merges global attributes', async tape => {
  resetRecords()

  trackingService.setGlobalAttribute('release', '1.0.0')
  trackingService.setGlobalAttribute('component', 'tracking-test')

  trackingService.trackEvent('integration-test-event', { action: 'click' })

  await waitForFlush()

  const { events } = getRecords()

  tape.equal(events.length, 1, 'captures exactly one event')

  const [eventItem] = events

  tape.equal(eventItem.type, TransportItemType.EVENT, 'event item stored')
  tape.equal(
    eventItem.payload.name,
    'integration-test-event',
    'event name persists'
  )
  tape.equal(
    eventItem.payload.attributes.action,
    'click',
    'attribute from call persists'
  )
  tape.equal(
    eventItem.payload.attributes.component,
    'tracking-test',
    'merges new global attribute'
  )
  tape.equal(
    eventItem.payload.attributes.release,
    '1.0.0',
    'merges global attribute with numeric-like value'
  )
  tape.equal(
    eventItem.payload.attributes.testSuite,
    'sdk-integration',
    'preserves default global attribute'
  )
  tape.end()
})

test('TrackingService trackError normalizes context-only options', async tape => {
  resetRecords()

  trackingService.trackError(new Error('integration failure'), {
    scenario: 'context-only'
  })

  await waitForFlush()

  const { errors } = getRecords()

  tape.equal(errors.length, 1, 'captures exactly one error')

  const [errorItem] = errors

  tape.equal(errorItem.type, TransportItemType.EXCEPTION, 'error item stored')
  tape.equal(
    errorItem.payload.value,
    'integration failure',
    'error message captured'
  )
  tape.equal(errorItem.payload.type, 'Error', 'error type captured')
  tape.equal(
    errorItem.payload.context.scenario,
    'context-only',
    'custom context forwarded'
  )
  tape.equal(
    errorItem.payload.context.testSuite,
    'sdk-integration',
    'global attributes merged with context'
  )
  tape.end()
})

test('TrackingService trackMeasurement adds attributes and context defaults', async tape => {
  resetRecords()

  trackingService.trackMeasurement('latency', 123.45, {
    attributes: { source: 'integration' },
    context: { region: 'us-east-1' }
  })

  await waitForFlush()

  const { measurements } = getRecords()

  tape.equal(measurements.length, 1, 'captures exactly one measurement')

  const [measurementItem] = measurements

  tape.equal(
    measurementItem.type,
    TransportItemType.MEASUREMENT,
    'measurement item stored'
  )
  tape.equal(measurementItem.payload.type, 'latency', 'measurement type set')
  tape.equal(
    measurementItem.payload.values.value,
    123.45,
    'measurement value kept as number'
  )
  tape.equal(
    measurementItem.payload.attributes.source,
    'integration',
    'custom measurement attribute kept'
  )
  tape.equal(
    measurementItem.payload.attributes.testSuite,
    'sdk-integration',
    'global attributes merged into measurement attributes'
  )
  tape.equal(
    measurementItem.payload.context.region,
    'us-east-1',
    'custom measurement context forwarded'
  )
  tape.equal(
    measurementItem.payload.context.testSuite,
    'sdk-integration',
    'global attributes merged into measurement context'
  )
  tape.end()
})

test(
  'TrackingService forwards events to Grafana collector when configured',
  { skip: shouldSkipGrafanaCollectorTest },
  async tape => {
    const globalRef = global
    const originalFetch = globalRef.fetch
    const originalWindowFetch = globalRef.window?.fetch
    const requests = []

    const recordFetch = (input, init) => {
      requests.push({
        input,
        init
      })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }

    globalRef.fetch = recordFetch
    if (globalRef.window) {
      globalRef.window.fetch = recordFetch
    }

    const collectorContext = {
      tracking: {
        url: grafanaCollectorUrl,
        appName: 'SDK Integration',
        appVersion: 'test-suite',
        globalAttributes: {
          suite: 'grafana-forwarding'
        },
        enableTracing: false,
        sessionTracking: false,
        isolate: true,
        instrumentations: []
      }
    }
    const collectorService = new TrackingService({
      context: collectorContext,
      options: {
        tracking: {
          enableTracing: false,
          sessionTracking: false,
          isolate: true,
          instrumentations: []
        }
      }
    })

    try {
      await collectorService.init({ context: collectorContext })

      const fetchTransport =
        collectorService._faroClient?.config?.transports?.find(
          transport =>
            transport?.name === '@grafana/faro-web-sdk:transport-fetch'
        )

      if (fetchTransport) {
        fetchTransport.disabledUntil = new Date(0)
      }

      collectorService.trackEvent('grafana-integration-test-event', {
        generatedAt: new Date().toISOString()
      })
      await waitForFlush()
      await waitForCollectorDispatch()
      await waitForCollectorDispatch()

      tape.ok(
        requests.length > 0,
        'performed HTTP request to Grafana collector'
      )

      const [request] = requests
      const requestUrl =
        typeof request?.input === 'string'
          ? request.input
          : request?.input?.url ?? ''

      tape.ok(
        requestUrl.startsWith(grafanaCollectorUrl),
        'request targets configured collector URL'
      )

      const method =
        request?.init && request.init.method
          ? request.init.method.toUpperCase()
          : 'POST'
      tape.equal(method, 'POST', 'uses POST method for collector request')

      const bodyText =
        typeof request?.init?.body === 'string' ? request.init.body : null

      tape.ok(bodyText, 'collector request payload is defined')
      if (bodyText) {
        tape.ok(
          bodyText.includes('grafana-integration-test-event'),
          'collector payload includes event name'
        )
      }
    } finally {
      collectorService.destroy()
      globalRef.fetch = originalFetch
      if (globalRef.window) {
        globalRef.window.fetch = originalWindowFetch
      }
    }
    tape.end()
  }
)

test('TrackingService setUser and clearUser synchronize faro metas', tape => {
  trackingService.setUser({
    id: 'user-123',
    email: 'integration@example.com'
  })

  const client = trackingService.getClient()
  tape.ok(client, 'faro client is available')

  const userMeta = client.metas?.value?.user

  tape.deepEqual(
    userMeta,
    {
      id: 'user-123',
      email: 'integration@example.com'
    },
    'user meta updated on client'
  )

  trackingService.clearUser()

  const clearedMeta = client.metas?.value?.user
  tape.ok(!clearedMeta, 'user meta cleared')
  tape.end()
})

test('TrackingService setSession and clearSession synchronize faro metas', tape => {
  trackingService.setSession({
    id: 'session-abc'
  })

  const client = trackingService.getClient()
  const sessionMeta = client.metas?.value?.session

  tape.deepEqual(
    sessionMeta,
    {
      id: 'session-abc'
    },
    'session meta updated on client'
  )

  trackingService.clearSession()
  const clearedSessionMeta = client.metas?.value?.session
  tape.equal(
    Object.keys(clearedSessionMeta || {}).length,
    0,
    'session meta cleared'
  )
  tape.end()
})

test.onFinish(() => process.exit(0))
