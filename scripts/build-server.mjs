// build-server.mjs — Bundles the Express server into a single CJS file for Vercel
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isVercel = !!process.env.VERCEL;

console.log('🔨 Bundling server with esbuild...');

// On Vercel: only build api/_bundle.js (the serverless entry point)
// Locally: also build apps/server/dist/ for local dev usage
const targets = isVercel
  ? [`${root}/api/_bundle.js`]
  : [
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
    // @prisma/client is kept external — Prisma uses __dirname to locate
    // its query engine binary (.node file) at runtime. Bundling it breaks
    // that path resolution. Vercel picks it up via includeFiles in vercel.json.
    external: ['@prisma/client'],
    tsconfig: `${root}/apps/server/tsconfig.json`,
    logLevel: 'warning',
    sourcemap: false,
  });
  console.log('✅ Bundle created:', outfile);
}
