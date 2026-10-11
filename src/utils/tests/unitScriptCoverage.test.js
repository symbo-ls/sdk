// `npm run test:unit-all` must run the node:test files in src/utils/tests
// (review 2026-10-10: the 3727-test tape run never reached
// sessionReacquirer / crossAppAuthAccessOnly / tokenRotationRace).
//
// Run: node --test src/utils/tests/unitScriptCoverage.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, '..', '..', '..', 'package.json'), 'utf8'))

test('test:unit-all runs every node:test file under src/utils/tests', () => {
  const nodeTestFiles = readdirSync(here)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => /from 'node:test'/.test(readFileSync(join(here, f), 'utf8')))
  assert.ok(nodeTestFiles.includes('sessionReacquirer.test.js'), 'CONTROL')
  const all = pkg.scripts['test:unit-all']
  const chain = [all, ...Object.entries(pkg.scripts).filter(([k]) => all.includes(`run ${k}`)).map(([, v]) => v)].join(' ')
  for (const f of nodeTestFiles) {
    assert.ok(
      chain.includes(`src/utils/tests/${f}`) || chain.includes('src/utils/tests/*.test.js'),
      `${f} is not run by test:unit-all`
    )
  }
})
