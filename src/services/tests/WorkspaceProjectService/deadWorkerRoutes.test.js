import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Nine workspaceProject wrappers called workspace-project worker routes that
// do not exist (dev answered 404 "no workspace route" for each; found by the
// worker-route drift check, server scripts/check-sdk-route-drift.mjs
// --worker). No live caller was found. They stay (an old caller must not get
// "not a function"), but each rejects AT ONCE with `code: 'route_removed'`,
// names itself, and names the method to call instead where one exists — and
// sends nothing.

const sandbox = sinon.createSandbox()
test.onFinish(() => sandbox.restore())

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer tok')
  svc._context = { activeWorkspaceId: 'ws-ctx' }
  return svc
}

const CASES = [
  ['meet.issueToken', (s) => s.meet.issueToken({ roomId: 'r1' }), 'sdk.meetMintToken({ roomId })'],
  [
    'meet.mute',
    (s) => s.meet.mute({ roomId: 'r1', participantIdentity: 'p', trackSid: 't', muted: true }),
    'sdk.meetMuteParticipant({ roomId, participantIdentity, trackSid, muted })'
  ],
  ['presence.online', (s) => s.presence.online('ws-1'), 'sdk.subscribePresence({ scope }, onSync)'],
  ['presence.heartbeat', (s) => s.presence.heartbeat('ws-1'), 'sdk.subscribePresence({ scope }, onSync)'],
  ['permissions.me', (s) => s.permissions.me(), 'sdk.getPermissions(orgId)'],
  [
    'permissions.check',
    (s) => s.permissions.check('edit', 'doc'),
    'sdk.getPermissions(orgId) (test the key in the answer)'
  ],
  ['system.status', (s) => s.system.status(), 'sdk.getSystemStatus()'],
  ['system.featureFlags', (s) => s.system.featureFlags(), 'sdk.getFeatureFlags()'],
  ['query', (s) => s.query({ sql: 'x' }), null]
]

for (const [name, call, replacement] of CASES) {
  test(`workspaceProject.${name} rejects at once with route_removed and sends nothing`, async t => {
    const svc = makeService()
    const ws = sandbox.stub(svc, '_ws').resolves({})
    const ext = sandbox.stub(svc, '_requestExternal').resolves({})
    const req = sandbox.stub(svc, '_request').resolves({})
    const pending = call(svc)
    t.ok(pending && typeof pending.then === 'function', 'a promise (callers await it)')
    try {
      await pending
      t.fail('should reject')
    } catch (err) {
      t.equal(err.code, 'route_removed', 'code')
      t.equal(err.method, `workspaceProject.${name}`, 'names the wrapper')
      t.equal(err.replacement, replacement, 'names the replacement (null when none)')
      t.ok(err.message.includes(`workspaceProject.${name}`), 'the message names the wrapper')
      if (replacement) t.ok(err.message.includes(replacement), 'the message names the replacement')
    }
    t.equal(ws.callCount + ext.callCount + req.callCount, 0, 'no request at all')
    sandbox.restore()
    t.end()
  })
}

// The dispatcher entries that map to these wrappers reach the same answer.
test('sdk.execute on a deprecated workspaceProject entity rejects with route_removed', async t => {
  const svc = makeService()
  const ws = sandbox.stub(svc, '_ws').resolves({})
  const execute = createEntityDispatcher({
    getService: (name) => (name === 'workspaceProject' ? svc : {})
  })
  for (const [entity, op, args] of [
    ['workspaceProject.presence', 'list', {}],
    ['workspaceProject.permissions', 'list', {}],
    ['workspaceProject.system', 'status', {}],
    ['workspaceProject.meet.token', 'rpc', { roomId: 'r1' }],
    ['workspaceProject.meet.mute', 'mute', { roomId: 'r1' }],
    ['workspaceProject.query', 'rpc', { body: {} }]
  ]) {
    try {
      await execute(entity, op, args)
      t.fail(`${entity} ${op} should reject`)
    } catch (err) {
      t.equal(err.code, 'route_removed', `${entity} ${op}`)
    }
  }
  t.equal(ws.callCount, 0, 'no worker request')
  sandbox.restore()
  t.end()
})
