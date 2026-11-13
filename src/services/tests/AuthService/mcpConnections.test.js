import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// MCP connector OAuth: the apps the signed-in person connected. Server:
//   GET    /core/auth/connections      the caller's live connections
//   DELETE /core/auth/connections/:id  end one (404 for another person's id,
//                                      an unknown one or an ended one)
// A signed-in browser session only, like /core/auth/sessions.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new AuthService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test.onFinish(() => sandbox.restore())

test('listMcpConnections GETs /auth/connections and returns the rows unchanged', async t => {
  const svc = makeService()
  const rows = [{
    id: '64b000000000000000000001',
    client_name: 'Claude',
    redirect_host: 'claude.ai',
    resource: 'https://mcp.symbols.app/account',
    scopes: ['account'],
    connected_at: '2026-11-13T10:00:00.000Z',
    last_used_at: '2026-11-13T11:00:00.000Z',
    expires_at: '2027-02-11T10:00:00.000Z'
  }]
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: rows })
  const out = await svc.listMcpConnections()
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/auth/connections', 'path')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(opts.methodName, 'listMcpConnections', 'methodName')
  t.deepEqual(out, rows, 'the rows come back unchanged')
  sandbox.restore()
  t.end()
})

test('revokeMcpConnection DELETEs /auth/connections/:id with the id encoded', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { revoked: true } })
  const out = await svc.revokeMcpConnection('a/b')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/auth/connections/a%2Fb', 'id encoded')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.methodName, 'revokeMcpConnection', 'methodName')
  t.equal(opts.body, undefined, 'no body')
  t.deepEqual(out, { revoked: true }, 'the answer comes back')
  sandbox.restore()
  t.end()
})

test('revokeMcpConnection needs an id and passes a 404 through unchanged', async t => {
  const svc = makeService()
  const refusal = new Error('No such connection.', { cause: { code: 'not_found' } })
  refusal.status = 404
  const stub = sandbox.stub(svc, '_request').rejects(refusal)
  try {
    await svc.revokeMcpConnection('')
    t.fail('no id should throw')
  } catch (err) {
    t.match(String(err.message), /id is required/, 'names the missing id')
  }
  t.equal(stub.callCount, 0, 'nothing is sent without an id')
  try {
    await svc.revokeMcpConnection('64b000000000000000000002')
    t.fail('the 404 should reject')
  } catch (err) {
    t.equal(err, refusal, 'the same error object reaches the caller')
  }
  sandbox.restore()
  t.end()
})

test('SERVICE_METHODS exposes the two connection methods at the top level (auth)', t => {
  t.equal(SERVICE_METHODS.listMcpConnections, 'auth', 'sdk.listMcpConnections')
  t.equal(SERVICE_METHODS.revokeMcpConnection, 'auth', 'sdk.revokeMcpConnection')
  t.end()
})
