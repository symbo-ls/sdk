// getPersonaSession — the server-truth reload oracle (tickets/opus.md
// PERSONA-3: "reload must re-render the pill from server truth, not client
// state"). Lives on WorkspaceProjectService — NOT PersonaService — so the
// request rides `_ws` → `_resolveAuthHeader`, the provider-aware header
// pipeline that carries the per-tab persona token. This suite pins exactly
// that transport property plus the pass-through response contract; it sits in
// the PersonaService test dir because it is the persona feature's oracle.
import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._workspacePrefix = 'https://api.example.test/workspace-project'
  return svc
}

test('SERVICE_METHODS maps getPersonaSession → workspaceProject (the provider-aware transport)', (t) => {
  t.equal(SERVICE_METHODS.getPersonaSession, 'workspaceProject')
  t.end()
})

test('getPersonaSession rides _ws with the SAME auth resolution as every workspace-project call', async (t) => {
  const svc = makeService()
  // The provider is the piece that supplies the per-tab persona token — the
  // oracle MUST consult it, or a live persona reads as inactive.
  const resolveStub = sandbox
    .stub(svc, '_resolveAuthHeader')
    .resolves('Bearer persona-token')
  const requestStub = sandbox
    .stub(svc, '_requestExternal')
    .resolves({ active: true, role: 'guest', sid: 'ps_1', actorWorkspaceRole: 'admin' })

  const out = await svc.getPersonaSession()

  t.equal(resolveStub.callCount, 1, 'header comes from _resolveAuthHeader (provider-aware)')
  t.equal(requestStub.callCount, 1)
  const [url, init] = requestStub.firstCall.args
  t.equal(url, 'https://api.example.test/workspace-project/persona')
  t.notOk(url.includes('/core/'), 'never the /core plane — the resolver choke point is worker-side')
  t.equal(init.authHeader, 'Bearer persona-token', 'the oracle presents the persona token itself')
  t.equal(init.methodName, 'getPersonaSession')
  t.same(out, { active: true, role: 'guest', sid: 'ps_1', actorWorkspaceRole: 'admin' })
  sandbox.restore()
  t.end()
})

test('stale shape passes through untouched — the recovery signal is the server\'s own words', async (t) => {
  const svc = makeService()
  sandbox.stub(svc, '_resolveAuthHeader').resolves('Bearer stale-persona-token')
  sandbox
    .stub(svc, '_requestExternal')
    .resolves({ active: false, stale: true, reason: 'persona session has ended' })

  const out = await svc.getPersonaSession()

  t.same(out, { active: false, stale: true, reason: 'persona session has ended' })
  sandbox.restore()
  t.end()
})
