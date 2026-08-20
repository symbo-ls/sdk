#!/usr/bin/env node
/**
 * Bundle `@symbo.ls/sdk` into a browser IIFE — `dist/sdk.iife.js`.
 *
 * WHY THIS EXISTS (FRAMEWORK-REGISTRY-SDK-SPECIFIER-1, Nika answer B,
 * 2026-08-20): `smbls` deliberately does NOT bundle this package — the
 * platform owns its own client. A frank-destringified project function that
 * imported from the sdk therefore compiles to a synchronous
 * `globalThis.__SMBLS_PKGS__['@symbo.ls/sdk']` read, and the PAGE RUNTIME is
 * contracted to fill that slot before `Smbls.create(...)` runs.
 *
 * A published page has no module loader and no reachable registry copy of
 * this package (`access: restricted` — every public CDN answers npm's E404),
 * so the only way the platform can honour that contract is to inline the
 * bundle it already holds. That is what this build emits, and
 * `scripts/build-iife-string.mjs` turns it into an importable string for
 * hosts with no filesystem (edge workers, the published-site builder).
 *
 * Mirrors `smbls`'s own `build:iife` + `build-iife-string.mjs` pair — same
 * flat `dist/<name>.iife.js` layout, same `iife-string` companion, so a host
 * inlines both runtimes the same way.
 *
 * `global` → `globalThis`: `src/config/environment.js` ends with
 * `if (global.window) global.window.finalConfig = finalConfig`. `global` is a
 * Node-only binding; in a browser it throws a ReferenceError that `getConfig`'s
 * own try/catch swallows, so the SDK would silently fall back to its error
 * config instead of the resolved one. `process` is NOT defined away: the
 * published page already injects `window.process = { env: { NODE_ENV } }` and
 * `window.__SYMBOLS_CHANNEL__` before any runtime script (see
 * @symbo.ls/mermaid `deployIdentity.js`), which is what makes the inlined SDK
 * resolve THIS deployment's API plane instead of a baked-in one.
 */
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(HERE, 'dist/sdk.iife.js');

const result = await build({
  entryPoints: [resolve(HERE, 'src/index.js')],
  outfile,
  bundle: true,
  format: 'iife',
  // The namespace the host reads back. `registerHostPackages` stores a MODULE
  // NAMESPACE, which is exactly what an IIFE global-name object is: every
  // named export of `src/index.js` as an own property.
  globalName: 'SymbolsSDK',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  define: { global: 'globalThis' },
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`[build-iife] wrote ${outfile} (${bytes} bytes)`);
