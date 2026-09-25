#!/usr/bin/env node
/**
 * Measures every shipped bundle (raw, gzip -9, brotli -q 11), enforces the size
 * budgets and writes dist/sizes.json for the README and the landing page.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

// Budgets in bytes, a few percent above what each bundle weighs today, so an
// accidental regression fails CI while a deliberate one updates this table.
const budgets = {
    'cyclewire.min.js': { brotli: 4864, gzip: 5376 },
    'css.min.js': { brotli: 768 },
    'dom.min.js': { brotli: 2304 },
    'morph.min.js': { brotli: 2048 },
    'signals.min.js': { brotli: 3200 },
    'bootstrap.min.js': { brotli: 2304 },
    'cyclewire.global.min.js': { brotli: 5120 },
    'cyclewire.full.global.min.js': { brotli: 12800 },
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
    report.files[file] = size;

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

if (failed) {
    console.error('Size budget exceeded.');
    process.exit(1);
}
