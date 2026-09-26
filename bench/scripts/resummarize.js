#!/usr/bin/env node
/**
 * Computes a results file's summaries again from its raw samples, with the
 * summaries this checkout defines, and checks the file against the schema.
 * Samples are what was measured; summaries are derived from them, so a run
 * made before a summary was added (the main thread's style and layout time,
 * say) can show it too.
 *
 *   node scripts/resummarize.js results/2026-09-26-mobile.json [more.json …]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { summarizeSamples } from '../runner/summary.js';
import { validate } from '../runner/validate.js';

const files = process.argv.slice(2);
if (!files.length) {
    console.error('Usage: node scripts/resummarize.js <results.json>...');
    process.exit(2);
}
let failed = false;
for (const file of files) {
    const results = JSON.parse(await readFile(file, 'utf8'));
    for (const stack of results.stacks) stack.summaries = stack.samples ? summarizeSamples(stack.samples, results.config.seed) : null;
    const problems = validate(results);
    if (problems.length) {
        console.error(`${file} does not match schema/results.v1.json:\n${problems.join('\n')}`);
        failed = true;
        continue;
    }
    await writeFile(file, `${JSON.stringify(results)}\n`);
    console.log(`${file}: summaries computed again for ${results.stacks.filter((stack) => stack.samples).length} stacks`);
}
process.exit(failed ? 1 : 0);
