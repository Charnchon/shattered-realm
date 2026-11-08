// Build Shattered Realm into one self-contained, playable index.html.
//   npm run build            one-off build
//   npm run build -- --watch rebuild on every change
// esbuild only strips types; run `npm run typecheck` (tsc) to check them.
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'shell.html');
const PLACEHOLDER = '/*__GAME__*/';

/** esbuild options shared by one-off and watch builds. */
const options = {
  entryPoints: [path.join(ROOT, 'src/main.ts')],
  outfile: path.join(ROOT, 'game.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  banner: { js: '"use strict";' },
  // images in assets/ are inlined, so index.html stays one self-contained file
  loader: { '.png': 'dataurl' },
  logLevel: 'warning',
  plugins: [{
    name: 'inline-into-html',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return;
        await writeHtml();
      });
    },
  }],
};

async function writeHtml() {
  const [shell, game] = await Promise.all([fs.readFile(SHELL, 'utf8'), fs.readFile(options.outfile, 'utf8')]);
  if (!shell.includes(PLACEHOLDER)) throw new Error(`shell.html has no ${PLACEHOLDER} placeholder`);
  // a replacer function, so `$` sequences in the game code are kept as-is
  await fs.writeFile(path.join(ROOT, 'index.html'), shell.replace(PLACEHOLDER, () => game), 'utf8');
  console.log(`built index.html (${game.length.toLocaleString('en-US')} chars)`);
}

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('watching src/ for changes...');
} else {
  await esbuild.build(options);
}
