// build-server.mjs — Bundles the Express server + all workspace packages into one CJS file
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🔨 Bundling server with esbuild...');

// Output to apps/server/dist/bundle.js AND api/_bundle.js
const targets = [
  `${root}/apps/server/dist/bundle.js`,
  `${root}/api/_bundle.js`,
];

for (const outfile of targets) {
  await build({
    entryPoints: [`${root}/apps/server/src/index.ts`],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile,
    external: [
      '@prisma/client',
      'prisma',
    ],
    tsconfig: `${root}/apps/server/tsconfig.json`,
    logLevel: 'warning',
    sourcemap: false,
  });
  console.log('✅ Server bundle created:', outfile);
}
