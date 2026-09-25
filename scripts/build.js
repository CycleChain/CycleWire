#!/usr/bin/env node
/**
 * Builds every distributable from src/ with esbuild:
 *
 *   dist/esm/*.js        one file per module, production (bundlers use this)
 *   dist/esm-dev/*.js    same, with development warnings ("development" export condition)
 *   dist/<name>.min.js   bundled + minified ES modules for CDNs and <script type="module">
 *   dist/cyclewire.global.min.js        classic script: core, auto-starts, sets window.CycleWire
 *   dist/cyclewire.full.global.min.js   classic script: core + css + dom + morph + signals + bootstrap
 *
 * Type declarations are emitted separately by `tsc` (see the "build" npm script).
 */
import { build } from 'esbuild';
import { readdir, readFile, rm } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const banner = `/*! CycleWire v${pkg.version} | MIT License | https://github.com/CycleChain/CycleWire */`;
const define = (dev) => ({ __DEV__: String(dev), __VERSION__: JSON.stringify(pkg.version) });
const common = { target: 'es2020', logLevel: 'warning', legalComments: 'inline' };

// The full classic-script build's entry is not a module of its own.
const skip = new Set(['full.js']);
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

const bundles = {
    'cyclewire.min.js': 'src/index.js',
    'css.min.js': 'src/css.js',
    'dom.min.js': 'src/dom.js',
    'morph.min.js': 'src/morph.js',
    'signals.min.js': 'src/signals.js',
    'bootstrap.min.js': 'src/bootstrap.js',
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
