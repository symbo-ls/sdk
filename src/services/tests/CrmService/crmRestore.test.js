import test from 'tape'
import sinon from 'sinon'
import { PartyService } from '../../PartyService.js'
import { LeadService } from '../../LeadService.js'
import { InteractionService } from '../../InteractionService.js'
import { DealService } from '../../DealService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Bring back a deleted CRM row (CRUD sweep item 6, 2026-11-01). Every CRM
// delete is a tombstone; the undo is POST /core/<entity>/:id/restore with the
// delete's own rights (workspace editor) and its ?workspaceId=. A contact is
// a party. Interactions and deals are new on the server too.

const sandbox = sinon.createSandbox()

const ENTITIES = [
  ['parties', PartyService],
  ['leads', LeadService],
  ['interactions', InteractionService],
  ['deals', DealService]
]

const makeService = (Service) => {
  const svc = new Service()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test.onFinish(() => sandbox.restore())

for (const [entity, Service] of ENTITIES) {
  test(`${entity}.restore POSTs /${entity}/:id/restore with ?workspaceId=`, async t => {
    const svc = makeService(Service)
    const stub = sandbox.stub(svc, '_call').resolves({ id: 'x1', deletedAt: null })
    const out = await svc.restore('x/1', { workspaceId: 'ws1' })
    await svc.restore('x2')
    const [name, path, opts] = stub.getCall(0).args
    t.equal(name, `${entity}.restore`, 'method name')
    t.equal(path, `/${entity}/x%2F1/restore?workspaceId=ws1`, 'id encoded; the workspace in the query')
    t.equal(opts.method, 'POST', 'POST')
    t.equal(opts.body, undefined, 'no body')
    t.equal(stub.getCall(1).args[1], `/${entity}/x2/restore`, 'no workspace: no query (the claim decides server-side)')
    t.deepEqual(out, { id: 'x1', deletedAt: null }, 'the restored row comes back')
    sandbox.restore()
    t.end()
  })
}

test("sdk.execute(<crm entity>, 'restore', …) maps the id and the workspace", async t => {
  const services = {}
  const stubs = {}
  for (const [entity, Service] of ENTITIES) {
    services[entity] = makeService(Service)
    stubs[entity] = sandbox.stub(services[entity], '_call').resolves({})
  }
  const execute = createEntityDispatcher({ getService: (name) => services[name] || null })
  for (const [entity] of ENTITIES) {
    await execute(entity, 'restore', { id: 'x1', workspaceId: 'ws1' })
    await execute(entity, 'restore', { id: 'x2' })
    t.deepEqual(stubs[entity].getCalls().map((c) => [c.args[0], c.args[1], c.args[2].method]), [
      [`${entity}.restore`, `/${entity}/x1/restore?workspaceId=ws1`, 'POST'],
      [`${entity}.restore`, `/${entity}/x2/restore`, 'POST']
    ], `${entity}: id + workspace reach the route`)
  }
  sandbox.restore()
  t.end()
})
