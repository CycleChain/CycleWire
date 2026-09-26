// Builds each action in ../cyclewire/src/actions/, and src/plugins.js, into a
// module of its own, with what it imports bundled in: a page without a
// bundled entry loads an action with one request, not one per chunk. Shared
// modules such as cyclewire/signals keep one state per page even when two
// files include them. esbuild's metafile says which file came from which
// source, for server.js.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const actions = readdirSync(here('../cyclewire/src/actions/')).filter((file) => file.endsWith('.js')).map((file) => here(`../cyclewire/src/actions/${file}`));

await build({
    entryPoints: [...actions, here('src/plugins.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    outdir: here('dist/js/'),
    entryNames: '[name]-[hash]',
    // The actions import cyclewire from this folder when ../cyclewire is not installed.
    nodePaths: [here('node_modules/')],
    metafile: true,
    write: true,
    logLevel: 'info',
}).then(({ metafile }) => import('node:fs').then(({ writeFileSync }) => writeFileSync(here('dist/meta.json'), JSON.stringify(metafile))));
