#!/usr/bin/env node
'use strict'

// symbols-sdk — standalone CLI for invoking @symbo.ls/sdk service methods.
// Auth flow: SYMBOLS_AUTH_TOKEN env var is the only supported source.
// (The full credential-broker flow lives in @symbo.ls/cli; this is the
// minimal "I have a token, run a method, print JSON" entry point.)

import chalk from 'chalk'
import { Command } from 'commander'
import { SERVICE_METHODS } from '../src/utils/services.js'
import SDK from '../src/index.js'

const groupMethodsByService = () => {
  const grouped = {}
  for (const [method, service] of Object.entries(SERVICE_METHODS)) {
    if (!grouped[service]) grouped[service] = []
    grouped[service].push(method)
  }
  return grouped
}

const parseArgs = (args) => args.map(arg => {
  try { return JSON.parse(arg) } catch { return arg }
})

const program = new Command()
  .name('symbols-sdk')
  .description('Invoke @symbo.ls/sdk service methods from the shell')
  .arguments('[method] [args...]')
  .option('-l, --list', 'List all available SDK methods')
  .option('-s, --service <name>', 'Filter methods by service name')
  .option('--api-url <url>', 'Override API URL (default: SYMBOLS_APP_API_URL or channel default)')
  .action(async (method, args, opts) => {
    if (opts.list || !method) {
      const grouped = groupMethodsByService()
      const filter = opts.service?.toLowerCase()
      console.log(chalk.cyan('\nAvailable SDK methods:\n'))
      for (const [service, methods] of Object.entries(grouped)) {
        if (filter && service.toLowerCase() !== filter) continue
        console.log(chalk.bold.white(`  ${service}:`))
        for (const m of methods) console.log(chalk.dim(`    ${m}`))
        console.log()
      }
      if (filter && !Object.keys(grouped).some(s => s.toLowerCase() === filter)) {
        console.log(chalk.yellow(`  No service named "${opts.service}" found.\n`))
      }
      console.log(chalk.dim('Usage: symbols-sdk <method> [args...]\n'))
      console.log(chalk.dim('Example: symbols-sdk getProjects'))
      console.log(chalk.dim('Example: symbols-sdk getProjectByKey \'{"key":"my-project"}\'\n'))
      return
    }

    const serviceName = SERVICE_METHODS[method]
    if (!serviceName) {
      console.error(chalk.red(`\nUnknown SDK method: ${method}`))
      console.log(chalk.dim('Run `symbols-sdk --list` to see available methods.\n'))
      process.exit(1)
    }

    const authToken = process.env.SYMBOLS_AUTH_TOKEN
    if (!authToken) {
      console.error(chalk.red('\nSYMBOLS_AUTH_TOKEN env var required.'))
      console.log(chalk.dim('Set it to a valid Symbols access token, e.g.:\n'))
      console.log(chalk.dim('  SYMBOLS_AUTH_TOKEN=$(smbls auth token) symbols-sdk getProjects\n'))
      process.exit(1)
    }

    const sdk = new SDK(opts.apiUrl ? { apiUrl: opts.apiUrl } : {})
    await sdk.initialize({ authToken })

    try {
      const result = await sdk[method](...parseArgs(args))
      if (result !== undefined) console.log(JSON.stringify(result, null, 2))
    } catch (err) {
      console.error(chalk.red(`\nSDK error (${serviceName}.${method}):`))
      console.error(chalk.yellow(err.message || err))
      process.exit(1)
    }
  })

program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red(err.message || err))
  process.exit(1)
})
