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
    // @prisma/client is kept external so Prisma can resolve its query engine
    // binary (.node file) at runtime using __dirname — bundling it breaks that path resolution.
    // Vercel picks up node_modules/@prisma/client via file tracing automatically.
    external: ['@prisma/client'],
    tsconfig: `${root}/apps/server/tsconfig.json`,
    logLevel: 'warning',
    sourcemap: false,
  });
  console.log('✅ Server bundle created:', outfile);
}
