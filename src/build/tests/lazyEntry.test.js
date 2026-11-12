import test from 'tape'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC = join(ROOT, 'src')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// Every non-test source file under src/ (no node_modules there).
const sourceFiles = (dir = SRC) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name)
    if (d.isDirectory()) return d.name === 'tests' || d.name === 'docs' ? [] : sourceFiles(p)
    return d.name.endsWith('.js') && !d.name.endsWith('.test.js') ? [p] : []
  })

test('package exposes the lazy entry for every condition the main entry has', (t) => {
  t.deepEqual(
    pkg.exports['./lazy'],
    {
      development: './src/lazy.js',
      import: './dist/esm/src/lazy.js',
      default: './dist/esm/src/lazy.js'
    },
    './lazy export'
  )
  t.ok(existsSync(join(SRC, 'lazy.js')), 'src/lazy.js exists')
  t.end()
})

// `import * as utils from '@symbo.ls/utils'` made a bundler keep all of the
// utils package for the SDK (RootStateManager, until 2026-11).
test('no namespace import of @symbo.ls/utils in the SDK sources', (t) => {
  const offenders = sourceFiles().filter((f) =>
    /import\s+\*\s+as\s+\w+\s+from\s+['"]@symbo\.ls\/utils['"]/.test(readFileSync(f, 'utf8'))
  )
  t.deepEqual(offenders.map((f) => f.slice(ROOT.length + 1)), [], 'named imports only')
  t.end()
})

// socket.io-client loads on the first subscription (utils/userSocket.js) and
// inside the lazily loaded CollabClient — never with a static import, which
// would put it in every bundle's entry.
test('no static import of socket.io-client in the SDK sources', (t) => {
  const offenders = sourceFiles().filter((f) =>
    /^\s*import\s[^;]*from\s+['"]socket\.io-client['"]/m.test(readFileSync(f, 'utf8'))
  )
  t.deepEqual(
    offenders.map((f) => f.slice(ROOT.length + 1)),
    ['src/utils/CollabClient.js'],
    'only CollabClient, which CollabService itself loads with import()'
  )
  t.end()
})

// `dist/` is gitignored, so these run only after a build.
test('built IIFE inlines the lazy service loaders (one file, nothing to split)', (t) => {
  const iifePath = join(ROOT, 'dist/sdk.iife.js')
  if (!existsSync(iifePath)) {
    t.skip('dist/sdk.iife.js not built — run npm run build:iife')
    return t.end()
  }
  const source = readFileSync(iifePath, 'utf8')
  t.notOk(/import\(\s*["']\.\.?\//.test(source), 'no relative import() left in the IIFE')
  t.notOk(/import\(\s*["']socket\.io-client["']\s*\)/.test(source), 'socket.io-client inlined')
  t.end()
})

test('built ESM keeps each lazy service behind its own import()', (t) => {
  const registryPath = join(ROOT, 'dist/esm/src/services/registry.js')
  if (!existsSync(registryPath)) {
    t.skip('dist/esm not built — run npm run build:esm')
    return t.end()
  }
  const source = readFileSync(registryPath, 'utf8')
  const dynamic = source.match(/import\(\s*["']\.\/\w+\.js["']\s*\)/g) || []
  t.equal(dynamic.length, 65, '65 lazy services, each a literal import() a bundler can split')
  t.ok(existsSync(join(ROOT, 'dist/esm/src/lazy.js')), 'dist/esm/src/lazy.js built')
  t.end()
})
