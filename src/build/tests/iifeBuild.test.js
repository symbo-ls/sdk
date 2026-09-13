import test from 'tape'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

// DRIFT GUARD for the published-page host registration
// (FRAMEWORK-REGISTRY-SDK-SPECIFIER-1 / PUBLISHED-PAGE-SDK-HOST-REGISTRATION-1).
//
// The platform inlines this package into every published page that reads
// `__SMBLS_PKGS__['@symbo.ls/sdk']`, and it reaches the bundle ONLY through
// the `./iife-string` export. `smbls`'s own build-iife-string.mjs header
// records the exact way that link breaks in practice: a dist-layout refactor
// moved the file and the emitter's paths silently did not follow. A consumer
// notices that as a dead surface on a published page, not as a failed build.
test('sdk package exposes the host-registration IIFE build', (t) => {
  t.equal(pkg.exports['./iife'], './dist/sdk.iife.js', './iife export path')
  t.equal(pkg.exports['./iife-string'], './dist/sdk.iife-string.js', './iife-string export path')
  t.ok(
    pkg.scripts.build.includes('build:iife'),
    'npm run build produces the IIFE (publish would otherwise ship the exports with no files behind them)',
  )
  t.ok(existsSync(resolve(ROOT, 'build-iife.mjs')), 'build-iife.mjs exists')
  t.ok(
    existsSync(resolve(ROOT, 'scripts/build-iife-string.mjs')),
    'scripts/build-iife-string.mjs exists',
  )
  t.end()
})

// `@symbo.ls/utils` reaches `@symbo.ls/fetch` through `await import(...)` (the
// fetch adapter's `initAdapterAuth`) but lists it only as an OPTIONAL peer, so
// neither bun nor npm installs it. The IIFE bundles everything, so a cold
// install died on `Could not resolve "@symbo.ls/fetch"` (sdk CI, 2026-09-12,
// SDK-ANALYZING-TSCONFIG-TS5011-ROOTDIR-CI-RED-1) while every warm tree — where
// a sibling workspace links the package — kept building. Marking it external
// is not a fix: a published page has no module loader to serve that import,
// and 3.14.788 and 3.14.789 shipped it inlined.
test('sdk declares the optional peer its IIFE bundles', (t) => {
  t.ok(
    pkg.devDependencies?.['@symbo.ls/fetch'],
    '@symbo.ls/fetch is a devDependency (utils lists it only as an optional peer)',
  )
  t.end()
})

// `dist/` is gitignored, so this half only runs after a build. Skipping when
// absent keeps a source-only checkout green; asserting when present is what
// catches a bundle that built but cannot be used.
test('built IIFE names the global the host registers', (t) => {
  const stringPath = resolve(ROOT, 'dist/sdk.iife-string.js')
  if (!existsSync(stringPath)) {
    t.skip('dist/sdk.iife-string.js not built — run npm run build:iife')
    return t.end()
  }
  const source = readFileSync(stringPath, 'utf8')
  t.ok(source.includes('export const globalName = "SymbolsSDK"'), 'globalName travels with the source')
  t.ok(source.includes('export const specifier = "@symbo.ls/sdk"'), 'specifier travels with the source')
  t.ok(source.includes('export default "'), 'the IIFE source is the default export')
  t.end()
})

test('built IIFE inlines @symbo.ls/fetch instead of importing it at runtime', (t) => {
  const iifePath = resolve(ROOT, 'dist/sdk.iife.js')
  if (!existsSync(iifePath)) {
    t.skip('dist/sdk.iife.js not built — run npm run build:iife')
    return t.end()
  }
  const source = readFileSync(iifePath, 'utf8')
  t.notOk(
    /import\(\s*["']@symbo\.ls\/fetch["']\s*\)/.test(source),
    'no runtime import("@symbo.ls/fetch") is left in the bundle',
  )
  t.end()
})
