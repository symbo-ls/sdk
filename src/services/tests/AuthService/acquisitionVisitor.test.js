import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'

// fly docs/FUNNEL.md §2 "Identity": at sign-up Fly sends `acquisition.visitor`
// (the analytics visitor id of the page — window.SymbolsAnalytics.visitorId)
// with the sign-up intent, and the server stores it on the user: the ONE
// stitch from an anonymous visitor to an account. Two SDK paths carry it:
//   - an e-mail sign-up: register({ …, acquisition: { visitor, … } }) — the
//     server reads `preset` + `acquisition` off the register body;
//   - a Google / GitHub sign-up: the OAuth routes read no intent, so after
//     ANY sign-in the client sends updateMe({ signupIntent: { acquisition:
//     { visitor, … } } }) (PATCH /auth/me).
// Both methods forward their body verbatim; this pins that a future "pick the
// known fields" refactor cannot silently drop the stitch.

const sandbox = sinon.createSandbox()
const VID = '3f0c1d2e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'

test('register forwards acquisition.visitor (and the rest of the intent) on the register body', async (t) => {
  const svc = new AuthService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { user: { id: 'u1' } } })
  await svc.register({
    email: 'new@example.ge',
    password: 'Pw-1!xxxxx',
    name: 'New',
    preset: 'agency',
    acquisition: { visitor: VID, source: 'symbols.app', campaign: 'fly', plan: 'pro' }
  })
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/register')
  const body = JSON.parse(opts.body)
  t.deepEqual(body.acquisition, { visitor: VID, source: 'symbols.app', campaign: 'fly', plan: 'pro' })
  t.equal(body.preset, 'agency')
  sandbox.restore()
  t.end()
})

test('updateMe forwards signupIntent.acquisition.visitor verbatim (the OAuth sign-up path)', async (t) => {
  const svc = new AuthService()
  svc._setReady()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, signupIntent: { stored: true } })
  await svc.updateMe({ signupIntent: { acquisition: { visitor: VID, source: 'fly.symbols.app' }, claimCredits: true } })
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/auth/me')
  t.equal(opts.method, 'PATCH')
  t.deepEqual(JSON.parse(opts.body), {
    signupIntent: { acquisition: { visitor: VID, source: 'fly.symbols.app' }, claimCredits: true }
  })
  sandbox.restore()
  t.end()
})
