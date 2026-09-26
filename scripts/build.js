#!/usr/bin/env node
/**
 * Builds every distributable from src/ with esbuild:
 *
 *   dist/esm/*.js        one file per module, production (bundlers use this)
 *   dist/esm-dev/*.js    same, with development warnings ("development" export condition)
 *   dist/<name>.min.js   bundled + minified ES modules for CDNs and <script type="module">
 *   dist/cyclewire.global.min.js        classic script: core, auto-starts, sets window.CycleWire
 *   dist/cyclewire.full.global.min.js   classic script: core + css + dom + morph + signals + stream + prefetch + bootstrap
 *
 * Type declarations are emitted separately by `tsc` (see the "build" npm script).
 */
import { build } from 'esbuild';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const banner = `/*! CycleWire v${pkg.version} | MIT License | https://github.com/CycleChain/CycleWire */`;
const define = (dev) => ({ __DEV__: String(dev), __VERSION__: JSON.stringify(pkg.version) });
const common = { target: 'es2020', logLevel: 'warning', legalComments: 'inline' };

// The full classic-script build's entry is not a module of its own, and the
// early script is built on its own, below.
const skip = new Set(['full.js', 'early.js']);
const sources = (await readdir('src'))
    .filter((file) => file.endsWith('.js') && !skip.has(file))
    .map((file) => `src/${file}`);

await rm('dist', { recursive: true, force: true });

for (const [dir, dev] of [['esm', false], ['esm-dev', true]]) {
    await build({
        ...common,
        entryPoints: sources,
        outdir: `dist/${dir}`,
        format: 'esm',
        define: define(dev),
        // Drops the `if (false) { … }` development branches while keeping the
        // output readable (no renaming, no whitespace removal).
        minifySyntax: !dev,
    });
}

// cyclewire/early hands out its script as source text, from
// Function.prototype.toString(), so it is minified in both directories: the
// text a page inlines is the minified one.
for (const dir of ['esm', 'esm-dev']) {
    await build({ ...common, entryPoints: ['src/early.js'], outfile: `dist/${dir}/early.js`, format: 'esm', minify: true });
}
// The same script to inline as it is, with the default prefix.
await build({
    ...common,
    stdin: { contents: "import { capture } from './src/early.js'; capture('cw-');", resolveDir: '.', loader: 'js' },
    outfile: 'dist/early.min.js',
    bundle: true,
    minify: true,
    format: 'iife',
    legalComments: 'none',
});

// A module whose imports from another were all development-only keeps a bare
// `import "./util.js";`: built one file at a time, esbuild cannot see that the
// other module does nothing when imported. Every module but auto.js is free of
// side effects (package.json's "sideEffects"), so the import only costs a
// request where the files load unbundled, and a warning in bundlers.
for (const file of await readdir('dist/esm')) {
    const path = `dist/esm/${file}`;
    const code = await readFile(path, 'utf8');
    const lean = code.replace(/^import "\.\/(?!auto\.js")[\w-]+\.js";\n/gm, '');
    if (lean !== code) await writeFile(path, lean);
}

const bundles = {
    'cyclewire.min.js': 'src/index.js',
    'css.min.js': 'src/css.js',
    'dom.min.js': 'src/dom.js',
    'morph.min.js': 'src/morph.js',
    'signals.min.js': 'src/signals.js',
    'stream.min.js': 'src/stream.js',
    'prefetch.min.js': 'src/prefetch.js',
    'bootstrap.min.js': 'src/bootstrap.js',
    'devtools.min.js': 'src/devtools.js',
};

for (const [file, entry] of Object.entries(bundles)) {
    await build({
        ...common,
        entryPoints: [entry],
        outfile: `dist/${file}`,
        bundle: true,
        minify: true,
        format: 'esm',
        sourcemap: 'linked',
        define: define(false),
        banner: { js: banner },
    });
}

for (const [file, entry] of Object.entries({
    'cyclewire.global.min.js': 'src/auto.js',
    'cyclewire.full.global.min.js': 'src/full.js',
})) {
    await build({
        ...common,
        entryPoints: [entry],
        outfile: `dist/${file}`,
        bundle: true,
        minify: true,
        format: 'iife',
        sourcemap: 'linked',
        define: define(false),
        banner: { js: banner },
    });
}

console.log(`Built CycleWire v${pkg.version} → dist/`);
