import test from 'tape'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// DRIFT GUARD for the published type declarations
// (SDK-ANALYZING-TSCONFIG-TS5011-ROOTDIR-CI-RED-1).
//
// TypeScript 6 no longer infers `rootDir` from the common source directory.
// A tsconfig without it fails with TS5011 ("The 'rootDir' setting must be
// explicitly set") and STILL writes the declarations one level deeper —
// `dist/types/src/index.d.ts` — so `types` in package.json names a file that
// does not exist. `build:types` swallows a non-zero tsc exit on purpose
// (publish proceeds), so nothing goes red: sdk CI printed TS5011 on
// 2026-09-12 and that step exited 0, and @symbo.ls/sdk@3.14.789 shipped with
// no file under dist/types/ at all.
const PACKAGES = [
  { name: '@symbo.ls/sdk', dir: ROOT },
  { name: '@symbo.ls/analyzing', dir: resolve(ROOT, 'packages/analyzing') },
]

for (const { name, dir } of PACKAGES) {
  const { compilerOptions } = readJson(resolve(dir, 'tsconfig.json'))
  const pkg = readJson(resolve(dir, 'package.json'))
  // The entry declaration, relative to declarationDir (`index.d.ts`).
  const entryDeclaration = relative(compilerOptions.declarationDir, pkg.types)

  test(`${name}: tsconfig lays the entry declaration where package.json types points`, (t) => {
    t.ok(compilerOptions.rootDir, 'compilerOptions.rootDir is explicit')
    // Without rootDir, TypeScript 6 roots the layout at the tsconfig directory.
    const emitted = join(
      compilerOptions.declarationDir,
      relative(compilerOptions.rootDir || '.', 'src/index.js').replace(/\.js$/, '.d.ts'),
    )
    t.equal(`./${emitted}`, pkg.types, `src/index.js declares to ${pkg.types}`)
    t.end()
  })

  test(`${name}: tsc emits the declarations without an error`, (t) => {
    const out = mkdtempSync(join(tmpdir(), 'sdk-types-'))
    try {
      const run = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', '--declarationDir', out, '--outDir', out],
        { cwd: dir, encoding: 'utf8' },
      )
      t.equal(run.status, 0, `tsc exits 0${run.status === 0 ? '' : `\n${run.stdout}${run.stderr}`}`)
      t.ok(existsSync(join(out, entryDeclaration)), `${entryDeclaration} is emitted at the top of declarationDir`)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
    t.end()
  })
}
