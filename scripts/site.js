#!/usr/bin/env node
/**
 * Assembles the GitHub Pages site into _site/ (or --out <dir>):
 *
 *   /               site/ (the landing page)
 *   /dist/          dist/*.min.js, their source maps and sizes.json
 *   /examples/      examples/dist/, the live examples, when built
 *   /docs/          docs-site/dist/, the documentation site, when built
 *   /bench/         the raw benchmark results, and a redirect from the old results page
 *
 * The package version is stamped into every element marked `data-version`,
 * and each bundle's brotli size from dist/sizes.json into every element
 * marked `data-size="<file>"`, so the page never shows a stale one; the build
 * fails if it finds no version mark or a size it cannot fill. The
 * landing page's Benchmark section is built from the newest published run of
 * each profile in bench/results/. `scripts/serve.js` does the same, so local
 * previews match.
 *
 *   npm run build && npm run size && npm run examples -- --production
 *   (cd docs-site && npm ci && npm run build)
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

/**
 * Writes each bundle's size into every element marked `data-size="<file>"`,
 * from dist/sizes.json's `files[file].label`.
 * @param {string} html
 * @param {{ files: Record<string, { label: string }> }} sizes
 * @returns {{ html: string, count: number }}
 */
export function stampSizes(html, sizes) {
    let count = 0;
    const out = html.replace(/(<([a-z][\w-]*)\b[^>]*?\sdata-size="([^"]+)"[^>]*>)[^<]*(<\/\2>)/gi, (match, open, tag, file, close) => {
        const found = sizes.files[file];
        if (!found) throw new Error(`dist/sizes.json has no size for ${file}.`);
        count++;
        return `${open}${found.label}${close}`;
    });
    return { html: out, count };
}

const BENCHMARK = /(<!-- bench:start -->)[\s\S]*?(<!-- bench:end -->)/;

/**
 * Puts the benchmark's section between the landing page's
 * <!-- bench:start --> and <!-- bench:end --> marks.
 * @param {string} html
 * @param {string} section
 */
export function insertBenchmark(html, section) {
    if (!BENCHMARK.test(html)) throw new Error('site/index.html has no <!-- bench:start --> … <!-- bench:end --> block.');
    return html.replace(BENCHMARK, (match, start, end) => `${start}\n${section}\n${end}`);
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

    const docs = join(root, 'docs-site', 'dist');
    if (await exists(docs)) await cp(docs, join(out, 'docs'), { recursive: true });
    else console.warn('docs-site/dist is missing, so the site has no documentation: run `npm ci && npm run build` in docs-site/.');

    const bench = await buildSite({ out: join(out, 'bench') });
    if (!bench.profiles.length) console.warn('bench/results has no published results, so the Benchmark section says so.');

    const page = join(out, 'index.html');
    const { html, count } = stamp(await readFile(page, 'utf8'), current);
    if (!count) throw new Error('site/index.html has no element marked data-version.');
    const sized = stampSizes(html, JSON.parse(await readFile(join(root, 'dist', 'sizes.json'), 'utf8')));
    await writeFile(page, insertBenchmark(sized.html, bench.html));
    await writeFile(join(out, '.nojekyll'), '');
    console.log(`Assembled the site for v${current} in ${out} (${count} version marks, ${sized.count} sizes).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const index = process.argv.indexOf('--out');
    await assemble(index > -1 ? process.argv[index + 1] : join(root, '_site'));
}
