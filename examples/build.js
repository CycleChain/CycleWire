#!/usr/bin/env node
/**
 * Builds the examples into examples/dist/ (git-ignored), the way an app would
 * be built: esbuild bundles each example's main.js with code splitting, so
 * each action, and every library or framework it imports, becomes a chunk
 * the page downloads on demand. Vite, webpack or Rollup produce the same
 * shape.
 *
 * An example with a server.js is rendered on the server first: the object its
 * render() returns fills the <!--ssr:name--> placeholders in index.html.
 *
 *   npm run build              CycleWire itself, into dist/ (examples import it from there)
 *   npm run examples           this script; add -- --production for minified production builds
 *   npm run dev                then open http://127.0.0.1:4173/examples/
 *
 * examples/dist/ has the layout of the live demos on GitHub Pages
 * (.github/workflows/pages.yml): an index page, the shared stylesheet, and
 * one directory per example. The browser tests build it before they start
 * (test/global-setup.js).
 */
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { compileScript, parse } from 'vue/compiler-sfc';

const here = dirname(fileURLToPath(import.meta.url));
const modules = join(here, '..', 'node_modules');
const root = join(here, 'dist');
const production = process.argv.includes('--production');
const mode = production ? 'production' : 'development';

const EXAMPLES = ['libraries', 'react', 'vue', 'svelte'];

/** Files an example serves from its own vendor/ directory, copied from node_modules. */
const VENDOR = {
    libraries: [
        'jquery/dist/jquery.min.js',
        'flatpickr/dist/flatpickr.min.css',
        'datatables.net-dt/css/dataTables.dataTables.min.css',
    ],
};

/**
 * Compiles .svelte files, for the browser or for server rendering. Svelte's
 * runtime picks its development mode from the "development" condition, which
 * the browser build sets and plain Node does not, so `dev` has to match.
 * @param {'client' | 'server'} generate
 * @returns {import('esbuild').Plugin}
 */
const svelte = (generate) => ({
    name: 'svelte',
    setup(context) {
        context.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            const dev = generate === 'client' && !production;
            const { js, warnings } = compile(await readFile(path, 'utf8'), { filename: path, generate, dev });
            return {
                contents: js.code,
                loader: 'js',
                resolveDir: dirname(path),
                warnings: warnings.map((warning) => ({ text: warning.message })),
            };
        });
    },
});

/**
 * Compiles <script setup> single-file components, for the browser or for
 * server rendering. Enough for the examples; real apps use @vitejs/plugin-vue.
 * @param {boolean} ssr
 * @returns {import('esbuild').Plugin}
 */
const vue = (ssr) => ({
    name: 'vue',
    setup(context) {
        context.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
            const { descriptor, errors } = parse(await readFile(path, 'utf8'), { filename: path });
            if (errors.length) throw errors[0];
            // The id scopes styles and must match on server and client.
            const script = compileScript(descriptor, { id: basename(path), inlineTemplate: true, templateOptions: { ssr } });
            return { contents: script.content, loader: 'js', resolveDir: dirname(path) };
        });
    },
});

const shared = {
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'warning',
    define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        // Vue's compile-time feature flags.
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
};

const exists = (path) => stat(path).then(() => true, () => false);

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await copyFile(join(here, 'index.html'), join(root, 'index.html'));
await copyFile(join(here, 'shared', 'example.css'), join(root, 'example.css'));

for (const name of EXAMPLES) {
    const source = join(here, name);
    const out = join(root, name);

    await build({
        ...shared,
        entryPoints: [join(source, 'main.js')],
        outdir: out,
        splitting: true,
        platform: 'browser',
        target: 'es2022',
        // "development" picks CycleWire's build with warnings, and the
        // frameworks' development builds with their hydration checks.
        conditions: [mode],
        chunkNames: 'chunks/[name]-[hash]',
        minify: production,
        sourcemap: !production,
        plugins: [svelte('client'), vue(false)],
    });

    let html = await readFile(join(source, 'index.html'), 'utf8');
    if (await exists(join(source, 'server.js')) || await exists(join(source, 'server.jsx'))) {
        const entry = (await exists(join(source, 'server.jsx'))) ? 'server.jsx' : 'server.js';
        const server = join(out, 'server.mjs');
        await build({
            ...shared,
            entryPoints: [join(source, entry)],
            outfile: server,
            platform: 'node',
            // Frameworks are imported from node_modules at render time.
            packages: 'external',
            plugins: [svelte('server'), vue(true)],
        });
        const rendered = await (await import(pathToFileURL(server).href)).render();
        await rm(server);
        html = html.replace(/<!--ssr:([\w-]+)-->/g, (placeholder, key) => {
            if (!(key in rendered)) throw new Error(`${name}/server: render() returned nothing for "${key}"`);
            return rendered[key];
        });
    }
    await writeFile(join(out, 'index.html'), html);

    for (const file of VENDOR[name] || []) {
        await mkdir(join(out, 'vendor'), { recursive: true });
        await copyFile(join(modules, file), join(out, 'vendor', basename(file)));
    }
}

console.log(`Built ${EXAMPLES.length} examples (${mode}) → examples/dist/`);
