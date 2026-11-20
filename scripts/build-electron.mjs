import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('⚡ Bundling Electron main and preload scripts...');

await build({
  entryPoints: [`${root}/apps/desktop/electron/main.ts`],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  outfile: `${root}/apps/desktop/dist-electron/main.js`,
});

await build({
  entryPoints: [`${root}/apps/desktop/preload/index.ts`],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  outfile: `${root}/apps/desktop/dist-electron/preload/index.js`,
});

console.log('✅ Electron scripts bundled successfully in apps/desktop/dist-electron');
