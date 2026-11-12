// Entity routes that used to live in their service files. EntityDispatcher
// needs them when the SDK starts; importing them from the service files made
// every bundle carry AiBoardsService and AssistantsService in its entry, even
// when those services load on first use (`lazyServices`). The service files
// re-export them, so `import { AI_BOARDS_ENTITY_ROUTE } from
// './AiBoardsService.js'` still works.

// The declarative fetch adapter hands `{ params, filter, … }`; imperative
// callers hand the flat bag. Both become one flat args object.
const flatArgs = (a) => {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return {}
  const { params, filter, ...rest } = a
  return {
    ...(filter && typeof filter === 'object' ? filter : {}),
    ...(params && typeof params === 'object' ? params : {}),
    ...rest
  }
}

/**
 * `sdk.execute('ai.boards', op, args)` — registered in EntityDispatcher's
 * ENTITY_ROUTES (see docs/patches in the server repo for the one-line hand-off).
 */
export const AI_BOARDS_ENTITY_ROUTE = Object.freeze({
  service: 'aiBoards',
  methods: Object.freeze({
    vocabulary: 'vocabulary',
    records: 'records',
    summary: 'summary',
    generate: 'generate',
    refine: 'refine',
    list: 'list',
    get: 'get',
    save: 'save',
    create: 'save',
    update: 'update',
    remove: 'remove',
    delete: 'remove'
  }),
  argMap: Object.freeze({
    vocabulary: (a) => [flatArgs(a)],
    records: (a) => [flatArgs(a)],
    summary: (a) => [flatArgs(a)],
    generate: (a) => [flatArgs(a)],
    refine: (a) => [flatArgs(a)],
    list: (a) => [flatArgs(a)],
    get: (a) => [flatArgs(a)],
    save: (a) => [flatArgs(a)],
    create: (a) => [flatArgs(a)],
    update: (a) => [flatArgs(a)],
    remove: (a) => [flatArgs(a)],
    delete: (a) => [flatArgs(a)]
  })
})

// sdk.execute('assistants', op, args): every op takes one args object.
export const ASSISTANTS_ENTITY_ROUTE = Object.freeze({
  service: 'assistants',
  methods: Object.freeze({
    list: 'list',
    get: 'get',
    update: 'update',
    revisions: 'revisions',
    rollback: 'rollback',
    usage: 'usage',
    resetCounter: 'resetCounter',
    testChat: 'testChat'
  })
})
