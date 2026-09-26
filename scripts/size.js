#!/usr/bin/env node
/**
 * Measures every shipped bundle (raw, gzip -9, brotli -q 11), enforces the size
 * budgets and writes dist/sizes.json for the README and the landing page.
 *
 *   node scripts/size.js            measure and check
 *   node scripts/size.js --readme   also rewrite the README's size table (before a release)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

// Budgets in bytes, a few percent above what each bundle weighs today, so an
// accidental regression fails CI while a deliberate one updates this table.
const budgets = {
    // 1.1 adds the touch look-ahead, registered(), defineAction(), the intent hook,
    // the adaptive yield and preload priorities: measured at 4952 B brotli.
    'cyclewire.min.js': { brotli: 5120, gzip: 5632 },
    'css.min.js': { brotli: 768 },
    'dom.min.js': { brotli: 2304 },
    // 1.1 pairs children first and moves only those out of the longest run in
    // order, and leaves subtrees equal to their new markup alone: two to three
    // times faster, measured at 2196 B brotli.
    'morph.min.js': { brotli: 2304 },
    // 1.1's reactive core walks the last run's reads instead of rebuilding its
    // subscriptions, checks versions before a computed runs again, and keeps a
    // lone subscriber without a set: two to five times faster, measured at
    // 3417 B brotli.
    'signals.min.js': { brotli: 3520 },
    'stream.min.js': { brotli: 4096 },
    'prefetch.min.js': { brotli: 768 },
    // Inlined in every page's <head>.
    'early.min.js': { brotli: 512 },
    'bootstrap.min.js': { brotli: 2304 },
    // Measured at 7031 B, plus 5%; it loads only when you open it.
    'devtools.min.js': { brotli: 7424 },
    'cyclewire.global.min.js': { brotli: 5376 },
    // With 1.1's signals and morph: measured at 15022 B.
    'cyclewire.full.global.min.js': { brotli: 15488 },
};

/** How the README names each bundle. */
const notes = {
    'cyclewire.min.js': 'core',
    'cyclewire.global.min.js': 'core + auto start',
    'morph.min.js': 'includes what it needs from dom',
    'stream.min.js': 'includes dom and morph',
    'prefetch.min.js': 'a plugin',
    'early.min.js': 'inline, before the core',
    'devtools.min.js': 'development only',
    'cyclewire.full.global.min.js': 'everything',
};

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const report = { version: pkg.version, files: {} };
const rows = [];
let failed = false;

for (const [file, budget] of Object.entries(budgets)) {
    const source = await readFile(`dist/${file}`);
    const size = {
        raw: source.length,
        gzip: gzipSync(source, { level: 9 }).length,
        brotli: brotliCompressSync(source, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: 11,
                [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
            },
        }).length,
    };
    // label feeds the README's size badge, read live from the deployed sizes.json.
    report.files[file] = { ...size, label: `${(size.brotli / 1000).toFixed(1)} kB` };

    const over = Object.entries(budget).filter(([kind, limit]) => size[kind] > limit);
    if (over.length) failed = true;
    rows.push({
        file,
        raw: size.raw,
        gzip: size.gzip,
        brotli: size.brotli,
        budget: Object.entries(budget).map(([kind, limit]) => `${kind} ≤ ${limit}`).join(', '),
        status: over.length ? `OVER (${over.map(([kind]) => kind).join(', ')})` : 'ok',
    });
}

console.table(rows);
await writeFile('dist/sizes.json', JSON.stringify(report, null, 2) + '\n');

if (process.argv.includes('--readme')) {
    const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
    const table = [
        '| File | brotli | gzip |',
        '| --- | --- | --- |',
        ...Object.entries(report.files).map(([file, size]) => `| \`${file}\`${notes[file] ? ` (${notes[file]})` : ''} | ${kB(size.brotli)} | ${kB(size.gzip)} |`),
    ].join('\n');
    const readme = await readFile('README.md', 'utf8');
    const marks = /(<!-- size:start -->)[\s\S]*?(<!-- size:end -->)/;
    if (!marks.test(readme)) throw new Error('README.md has no <!-- size:start --> … <!-- size:end --> block.');
    await writeFile('README.md', readme.replace(marks, (match, start, end) => `${start}\n${table}\n${end}`));
    console.log('Updated the size table in README.md');
}

if (failed) {
    console.error('Size budget exceeded.');
    process.exit(1);
}
