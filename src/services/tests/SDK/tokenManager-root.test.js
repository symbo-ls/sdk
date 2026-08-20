import test from 'tape'
import { SDK } from '../../../index.js'

// SDK-TOKENMANAGER-ROOT-1: `sdk._tokenManager` was ALWAYS undefined —
// nothing ever assigned it on the SDK root, only inside each BaseService.
// magic-callback.js reads `sdk?._tokenManager` and throws when it is
// missing; mintLivekitToken.js reads it inside a try/catch and silently
// no-ops. Assert the root actually resolves, not just that init doesn't
// throw — that is exactly the class of bug a stub-fabricated property
// would hide (see the ticket's "test trap" note).

test('SDK root exposes a real _tokenManager, and only after initialize()', async t => {
  const sdk = new SDK({ apiUrl: 'http://localhost:0/api' })

  t.equal(sdk._tokenManager, null, 'pre-initialize: null, not silently undefined')

  await sdk.initialize({})

  t.ok(sdk._tokenManager, 'post-initialize: root token manager resolves')
  t.equal(typeof sdk._tokenManager.setTokens, 'function', 'has setTokens — what magic-callback.js calls')
  t.equal(typeof sdk._tokenManager.ensureValidToken, 'function', 'has ensureValidToken — what mintLivekitToken.js calls')
  t.equal(sdk._tokenManager, sdk.getService('auth')._tokenManager, 'root and every service share the one singleton')

  t.end()
})
