// Bundles the page's script with esbuild, the bundler Turbo's installation
// guide names: Turbo, Stimulus and the controllers in one minified file whose
// name carries a hash of its content. Everything else is esbuild's default
// for the browser, among them the IIFE format, which a classic <script defer>
// runs. The file name goes into dist/manifest.json for the server.
import { build } from 'esbuild';
import { rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

await rm('dist', { recursive: true, force: true });
const { metafile } = await build({
    entryPoints: ['src/application.js'],
    bundle: true,
    minify: true,
    outdir: 'dist/js',
    entryNames: '[name]-[hash]',
    metafile: true,
});
const [application] = Object.entries(metafile.outputs).filter(([, output]) => output.entryPoint).map(([path]) => basename(path));
await writeFile('dist/manifest.json', `${JSON.stringify({ application })}\n`);
console.log(`Built dist/js/${application}`);
