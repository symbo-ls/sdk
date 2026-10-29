import test from 'tape'
import sinon from 'sinon'
import { MeetService } from '../../MeetService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// meetMintToken — POST /core/meet/token: a LiveKit token for the signed-in
// caller to join a meet room. The SDK had no wrapper for this route, so the
// workspace meet package fetched it raw (its own bearer read, its own API
// base); the SDK's workspaceProject.meet.issueToken still pointed at a worker
// route that went when the token moved to /core. This is the wrapper both
// now name.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new MeetService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

const TOKEN = { roomName: 'room-1', livekitToken: 'lk.jwt', livekitUrl: 'wss://lk', workspaceId: 'ws-1' }

test('meetMintToken POSTs /meet/token with { roomId } and returns the bare payload', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves(TOKEN)
  const out = await svc.meetMintToken({ roomId: 'room-1' })
  t.equal(stub.callCount, 1, 'one request')
  const [endpoint, init] = stub.firstCall.args
  t.equal(endpoint, '/meet/token', 'the /core meet route (BaseService adds /core)')
  t.equal(init.method, 'POST', 'POST')
  t.deepEqual(JSON.parse(init.body), { roomId: 'room-1' }, 'body { roomId }')
  t.equal(init.methodName, 'meetMintToken', 'method name for telemetry')
  t.deepEqual(out, TOKEN, 'the payload as the server sends it')
  sandbox.restore()
  t.end()
})

test('meetMintToken keeps the HTTP status of a refusal (403 no access)', async t => {
  const svc = makeService()
  const httpErr = new Error('forbidden')
  httpErr.status = 403
  sandbox.stub(svc, '_request').rejects(httpErr)
  try {
    await svc.meetMintToken({ roomId: 'room-1' })
    t.fail('should reject')
  } catch (err) {
    t.equal(err.status, 403, 'err.status')
    t.equal(err.message, 'forbidden', 'the server text')
  }
  sandbox.restore()
  t.end()
})

test('meetMintToken without a roomId throws and sends nothing', t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves(TOKEN)
  t.throws(() => svc.meetMintToken({}), /roomId is required/)
  t.throws(() => svc.meetMintToken(), /roomId is required/)
  t.equal(stub.callCount, 0, 'no request')
  sandbox.restore()
  t.end()
})

test('sdk.meetMintToken is a top-level proxy to the meet service', t => {
  t.equal(SERVICE_METHODS.meetMintToken, 'meet')
  t.end()
})
