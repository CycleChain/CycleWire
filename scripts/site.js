#!/usr/bin/env node
/**
 * Assembles the GitHub Pages site into _site/ (or --out <dir>):
 *
 *   /               site/ (the landing page)
 *   /dist/          dist/*.min.js, their source maps and sizes.json
 *   /examples/      examples/dist/, the live examples, when built
 *   /bench/         the benchmark's results page, from bench/results/
 *
 * The package version is stamped into every element marked `data-version`,
 * so the page never shows a stale one; the build fails if it finds none.
 * `scripts/serve.js` applies the same stamp, so local previews match.
 *
 *   npm run build && npm run size && npm run examples -- --production
 *   node scripts/site.js
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite } from '../bench/scripts/build-site.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The version in package.json. */
export const version = async () => JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;

/**
 * Writes `v<version>` into every element marked `data-version`.
 * @param {string} html
 * @param {string} version
 * @returns {{ html: string, count: number }}
 */
export function stamp(html, version) {
    let count = 0;
    // An opening tag carrying data-version, its text, and the matching closing tag.
    const out = html.replace(/(<([a-z][\w-]*)\b[^>]*?\sdata-version(?=[\s=>/])[^>]*>)[^<]*(<\/\2>)/gi, (match, open, tag, close) => {
        count++;
        return `${open}v${version}${close}`;
    });
    return { html: out, count };
}

const exists = (path) => stat(path).then(() => true, () => false);

/** @param {string} out */
export async function assemble(out) {
    const current = await version();
    await rm(out, { recursive: true, force: true });
    await mkdir(join(out, 'dist'), { recursive: true });
    await cp(join(root, 'site'), out, { recursive: true });

    if (!(await exists(join(root, 'dist', 'sizes.json')))) throw new Error('dist/sizes.json is missing: run `npm run build && npm run size` first.');
    for (const file of await readdir(join(root, 'dist'))) {
        if (/\.min\.js(?:\.map)?$/.test(file) || file === 'sizes.json') await cp(join(root, 'dist', file), join(out, 'dist', file));
    }

    const examples = join(root, 'examples', 'dist');
    if (await exists(examples)) await cp(examples, join(out, 'examples'), { recursive: true });
    else console.warn('examples/dist is missing, so the site has no live examples: run `npm run examples -- --production`.');

    const profiles = await buildSite({ out: join(out, 'bench') });
    if (!profiles.length) console.warn('bench/results has no published results, so /bench/ says so.');

    const page = join(out, 'index.html');
    const { html, count } = stamp(await readFile(page, 'utf8'), current);
    if (!count) throw new Error('site/index.html has no element marked data-version.');
    await writeFile(page, html);
    await writeFile(join(out, '.nojekyll'), '');
    console.log(`Assembled the site for v${current} in ${out} (${count} version marks).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const index = process.argv.indexOf('--out');
    await assemble(index > -1 ? process.argv[index + 1] : join(root, '_site'));
}
