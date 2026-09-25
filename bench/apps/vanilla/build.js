// Bundles and minifies src/app.js into dist/js/ with a content hash, and
// records the file name in dist/manifest.json for the server.
import { build } from 'esbuild';
import { rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

await rm('dist', { recursive: true, force: true });
const { metafile } = await build({
    entryPoints: { app: 'src/app.js' },
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    outdir: 'dist/js',
    entryNames: '[name]-[hash]',
    legalComments: 'none',
    metafile: true,
});
const [entry] = Object.entries(metafile.outputs).filter(([, output]) => output.entryPoint).map(([file]) => basename(file));
await writeFile('dist/manifest.json', JSON.stringify({ app: entry }));
console.log(`Built dist/js/${entry}`);
