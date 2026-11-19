// build-server.mjs — Bundles the Express server + all workspace packages into one CJS file
// This solves Vercel's "Cannot find package @erp/..." error

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🔨 Bundling server with esbuild...');
console.log('   Root:', root);

await build({
  entryPoints: [`${root}/apps/server/src/index.ts`],
  bundle: true,           // Bundle ALL imports (workspace packages included)
  platform: 'node',
  target: 'node20',
  format: 'cjs',          // CommonJS — works with api/index.js require()
  outfile: `${root}/apps/server/dist/bundle.js`,

  // Keep these as external — they have native binaries Vercel installs separately
  external: [
    '@prisma/client',
    'prisma',
  ],

  // Let esbuild read tsconfig for path aliases (@erp/validation etc.)
  tsconfig: `${root}/apps/server/tsconfig.json`,

  // Suppress noisy logs
  logLevel: 'info',
  sourcemap: false,
});

console.log('✅ Server bundle created: apps/server/dist/bundle.js');
