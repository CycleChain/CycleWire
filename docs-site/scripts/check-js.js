#!/usr/bin/env node
/**
 * Keeps the documentation site as light as the library it documents. After
 * a build, every page may load at most BUDGET bytes of JavaScript before
 * anyone interacts (its scripts, what they import statically, and inline
 * scripts), Pagefind's search interface only once someone opens the search,
 * and no component that hydrates. `npm run build` runs it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const BASE = '/CycleWire/docs/';
/** Uncompressed bytes a page may load up front: theme, navigation, table of contents, copy buttons. */
export const BUDGET = 20_000;
const SEARCH_UI = /pagefind|ui-core/;

async function* pages(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* pages(path);
        else if (entry.name.endsWith('.html')) yield path;
    }
}

/** A module and everything it imports statically, as paths in dist/. */
async function graph(file, seen = new Set()) {
    if (seen.has(file)) return seen;
    seen.add(file);
    const code = await readFile(join(DIST, file), 'utf8');
    // Static imports only: `import(…)` loads later, when it is needed.
    for (const match of code.matchAll(/(?:^|[;\s}])import\s*(?:[\w*{},\s$]+from\s*)?["']([^"']+\.js)["']/g)) {
        await graph(join(file, '..', match[1]).replace(/\\/g, '/'), seen);
    }
    return seen;
}

const problems = [];
let heaviest = { page: '', bytes: 0 };
for await (const path of pages(DIST)) {
    const html = await readFile(path, 'utf8');
    const page = relative(DIST, path);
    if (html.includes('<astro-island')) problems.push(`${page} hydrates a component.`);
    let bytes = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        const [, attributes, body] = match;
        if (/type="application\/(?:ld\+)?json"/.test(attributes)) continue;
        const src = /\ssrc="([^"]+)"/.exec(attributes)?.[1];
        if (!src) {
            bytes += Buffer.byteLength(body);
            continue;
        }
        if (!src.startsWith(BASE)) {
            problems.push(`${page} loads a script from elsewhere: ${src}`);
            continue;
        }
        for (const file of await graph(src.slice(BASE.length))) {
            if (SEARCH_UI.test(file)) problems.push(`${page} loads the search interface up front (${file}).`);
            bytes += (await readFile(join(DIST, file))).length;
        }
    }
    if (bytes > BUDGET) problems.push(`${page} loads ${bytes} bytes of JavaScript up front; the budget is ${BUDGET}.`);
    if (bytes > heaviest.bytes) heaviest = { page, bytes };
}

if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log(`JavaScript check passed: at most ${heaviest.bytes} of ${BUDGET} bytes up front (${heaviest.page}), search on demand, nothing hydrates.`);
