// @symbo.ls/sdk/build.js
import process from 'process'
import * as esbuild from 'esbuild'
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill'
import { glob } from 'glob'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function findEntryPoints () {
  const files = await glob('src/**/*.js', {
    ignore: ['src/**/*.test.js', 'src/**/*.spec.js'],
    absolute: true
  })
  return files
}

async function buildSDK () {
  const entryPoints = await findEntryPoints()

  const commonOptions = {
    entryPoints,
    minify: true,
    sourcemap: true,
    logLevel: 'debug',
    absWorkingDir: path.resolve(__dirname)
  }

  try {
    // Build ESM for browsers
    await esbuild.build({
      ...commonOptions,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2019'],
      outdir: 'dist/browser',
      plugins: [
        nodeModulesPolyfillPlugin()
      ]
    })

    // Build ESM for Node.js
    await esbuild.build({
      ...commonOptions,
      bundle: false,
      format: 'esm',
      platform: 'node',
      target: ['node16'],
      outdir: 'dist/node'
    })

    // Build CJS for Node.js (for compatibility)
    await esbuild.build({
      ...commonOptions,
      bundle: false,
      format: 'cjs',
      platform: 'node',
      target: ['node16'],
      outdir: 'dist/cjs'
    })

    console.log('Build completed successfully')
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

await buildSDK()
