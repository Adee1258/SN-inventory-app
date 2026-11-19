// build-server.mjs — Bundles the Express server + all workspace packages into one CJS file
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🔨 Bundling server with esbuild...');

// Output bundled server to all necessary entry points
const targets = [
  `${root}/apps/server/dist/index.js`,
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
    // @prisma/client must NOT be external on Vercel — it needs to be bundled
    // because Vercel serverless runtime cannot resolve workspace node_modules at runtime.
    // Only exclude the native .node binary engine (handled separately by prisma generate).
    external: [],
    tsconfig: `${root}/apps/server/tsconfig.json`,
    logLevel: 'warning',
    sourcemap: false,
  });
  console.log('✅ Server bundle created:', outfile);
}
