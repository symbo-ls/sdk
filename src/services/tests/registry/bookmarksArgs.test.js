import test from 'tape'

import { createEntityDispatcher } from '../../EntityDispatcher.js'

test('workspaceProject.bookmarks.enrich keeps URL in the body and workspaceId in routing options', async (t) => {
  t.plan(3)
  const calls = []
  const execute = createEntityDispatcher({
    getService: () => ({
      bookmarks: {
        enrich: (...args) => {
          calls.push(args)
          return Promise.resolve({})
        }
      }
    })
  })

  await execute('workspaceProject.bookmarks', 'enrich', {
    url: 'https://example.test/page',
    workspaceId: 'ws-1'
  })

  t.deepEqual(calls[0][0], { url: 'https://example.test/page' })
  t.deepEqual(calls[0][1], { workspaceId: 'ws-1' })
  t.equal(calls[0].length, 2, 'no context-only SDK details leak into the request body')
  t.end()
})
