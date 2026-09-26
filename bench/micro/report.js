#!/usr/bin/env node
/**
 * Prints micro results as Markdown tables: every scenario and operation with
 * the median and its 95% confidence interval for each library, the morph
 * correctness cases, the mutation counts, and everything that failed.
 *
 *   node report.js out/2026-09-26T12-00-00.json
 */
import { readFile } from 'node:fs/promises';

const [file] = process.argv.slice(2);
if (!file) {
    console.error('Usage: node report.js <results.json>');
    process.exit(2);
}
const results = JSON.parse(await readFile(file, 'utf8'));
const { environment, config, signals, morph, failures } = results;

/** @param {number | null} value */
const ms = (value) => (value === null ? '–' : value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : String(Math.round(value)));
/** @param {any} summary */
const cell = (summary) => (summary?.n ? `${ms(summary.median)} (${ms(summary.ci95[0])}–${ms(summary.ci95[1])})` : '–');
const BROWSER_NAMES = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
const browserName = (/** @type {string} */ name) => BROWSER_NAMES[/** @type {keyof typeof BROWSER_NAMES} */ (name)] ?? name;
const escape = (/** @type {string} */ text) => text.replace(/\|/g, '\\|').replace(/</g, '&lt;');

/** @param {string[]} header @param {string[][]} rows @param {string[]} [align] */
function table(header, rows, align = []) {
    console.log(`| ${header.join(' | ')} |`);
    console.log(`| ${header.map((_, i) => align[i] ?? '---').join(' | ')} |`);
    for (const row of rows) console.log(`| ${row.join(' | ')} |`);
    console.log();
}

console.log('## Micro benchmarks\n');
const commit = environment.commit ? environment.commit.slice(0, 7) : 'unknown';
console.log(`${config.samples} samples per measurement after ${config.warmup} warm-up, on ${environment.cpu} (${environment.cores} cores, ${environment.runner}, ${environment.os}), Node ${environment.node}, commit ${commit}. Load average ${environment.loadAverage.join(' / ')} at the start${environment.loadAverageEnd ? `, ${environment.loadAverageEnd.join(' / ')} at the end` : ''}.\n`);
console.log('Cells: the median in ms, with its 95% confidence interval. Lower is faster. Intervals that overlap mean the data cannot tell the two apart. **failed** means a check did not hold: the library computed or rendered something wrong, and no time is given.\n');

if (signals) {
    console.log(`### Signals (Node ${environment.node})\n`);
    console.log('Each scenario ran in a Node process of its own for each library, with a garbage collection before every sample.\n');
    const libraries = signals.libraries;
    const header = ['Scenario', ...libraries.map((/** @type {any} */ library) => `${library.name} ${library.version ?? ''}`.trim())];
    /** @param {string} library @param {string} scenario */
    const result = (library, scenario) => signals.results.find((/** @type {any} */ row) => row.library === library && row.scenario === scenario);
    table(
        header,
        signals.scenarios.map((/** @type {any} */ scenario) => [
            escape(scenario.title),
            ...libraries.map((/** @type {any} */ library) => {
                const row = result(library.id, scenario.id);
                return !row ? '–' : row.status === 'ok' ? cell(row.summary) : '**failed**';
            }),
        ]),
        ['---', ...libraries.map(() => '--:')],
    );
    const counted = signals.scenarios.filter((/** @type {any} */ scenario) => signals.results.some((/** @type {any} */ row) => row.scenario === scenario.id && row.counts?.evaluations !== undefined));
    if (counted.length) {
        console.log('How many times computeds ran (per iteration for the kairo scenarios, per sample for the dynamic graphs). Fewer means work avoided:\n');
        table(
            ['Scenario', ...libraries.map((/** @type {any} */ library) => library.name)],
            counted.map((/** @type {any} */ scenario) => [escape(scenario.title), ...libraries.map((/** @type {any} */ library) => (result(library.id, scenario.id)?.counts?.evaluations ?? '–').toLocaleString('en'))]),
            ['---', ...libraries.map(() => '--:')],
        );
    }
    for (const library of libraries.filter((/** @type {any} */ item) => item.note)) console.log(`- ${library.name}: ${library.note}`);
    const failed = signals.results.filter((/** @type {any} */ row) => row.status === 'failed');
    if (failed.length) {
        console.log('\nFailed:\n');
        for (const row of failed) console.log(`- ${row.scenario}, ${row.library}: ${escape(row.message)}`);
    }
    console.log();
}

if (morph) {
    const libraries = morph.libraries;
    const browsers = morph.browsers;
    console.log('### Morph: correctness\n');
    console.log(`${browsers.map((/** @type {any} */ browser) => `${browserName(browser.name)} ${browser.version}`).join(', ')}. "yes" means the result is what a person would want (see each case in bench/micro/README.md).\n`);
    /** @param {string} library @param {string} id */
    const rows = (library, id) => morph.correctness.filter((/** @type {any} */ row) => row.library === library && row.case === id);
    table(
        ['Case', ...libraries.map((/** @type {any} */ library) => `${library.name} ${library.version ?? ''}`.trim())],
        morph.cases.map((/** @type {any} */ entry) => [
            escape(entry.title) + (entry.design ? ' ¹' : ''),
            ...libraries.map((/** @type {any} */ library) => {
                const found = rows(library.id, entry.id);
                if (!found.length) return '–';
                if (found.every((/** @type {any} */ row) => row.pass)) return 'yes';
                if (found.every((/** @type {any} */ row) => !row.pass)) return '**no**';
                return found.map((/** @type {any} */ row) => `${browserName(row.browser)} ${row.pass ? 'yes' : '**no**'}`).join(', ');
            }),
        ]),
    );
    const designed = morph.cases.filter((/** @type {any} */ entry) => entry.design);
    if (designed.length) {
        console.log('¹ The libraries differ here by design:\n');
        for (const entry of designed) console.log(`- ${escape(entry.title)}: ${escape(entry.design)}`);
        console.log();
    }
    const problems = morph.correctness.filter((/** @type {any} */ row) => !row.pass);
    if (problems.length) {
        console.log('What was not as a person would want:\n');
        for (const entry of morph.cases) {
            for (const library of libraries) {
                const failing = rows(library.id, entry.id).filter((/** @type {any} */ row) => !row.pass);
                if (!failing.length) continue;
                const where = failing.map((/** @type {any} */ row) => browserName(row.browser)).join(', ');
                console.log(`- ${escape(entry.title)}, ${library.name} (${where}): ${escape([...new Set(failing.flatMap((/** @type {any} */ row) => row.problems))].join('; '))}`);
            }
        }
        console.log();
    }

    for (const browser of browsers) {
        const speed = morph.speed.filter((/** @type {any} */ row) => row.browser === browser.name);
        if (!speed.length) continue;
        /** @param {string} library @param {string} operation */
        const find = (library, operation) => speed.find((/** @type {any} */ row) => row.library === library && row.operation === operation);
        const header = ['Operation', ...libraries.map((/** @type {any} */ library) => library.name)];
        const align = ['---', ...libraries.map(() => '--:')];
        console.log(`### Morph: speed in ${browserName(browser.name)} ${browser.version}\n`);
        console.log(`${Math.max(0, ...morph.operations.map((/** @type {any} */ operation) => operation.rows)).toLocaleString('en')} keyed rows; every sample morphs a fresh copy. Timer resolution ${browser.timerResolutionMs} ms${browser.crossOriginIsolated ? ' (cross-origin isolated)' : ''}; ${browser.gc ? 'garbage collected before every sample' : 'no forced garbage collection (the browser does not expose it)'}; Element.moveBefore() ${browser.moveBefore ? 'available' : 'not available'}.\n`);
        console.log('The morph call:\n');
        table(
            header,
            morph.operations.map((/** @type {any} */ operation) => [escape(operation.title), ...libraries.map((/** @type {any} */ library) => {
                const row = find(library.id, operation.id);
                return !row ? '–' : row.status === 'ok' ? cell(row.summary) : '**failed**';
            })]),
            align,
        );
        console.log('The morph call and the style and layout it forces:\n');
        table(
            header,
            morph.operations.map((/** @type {any} */ operation) => [escape(operation.title), ...libraries.map((/** @type {any} */ library) => {
                const row = find(library.id, operation.id);
                return !row ? '–' : row.status === 'ok' ? cell(row.summaryWithLayout) : '**failed**';
            })]),
            align,
        );
        console.log('MutationObserver records for one run, and the rows that stayed the same elements (fewer records is less work; kept rows keep their state):\n');
        table(
            header,
            morph.operations.map((/** @type {any} */ operation) => [escape(operation.title), ...libraries.map((/** @type {any} */ library) => {
                const row = find(library.id, operation.id);
                if (!row?.mutations) return '–';
                const kept = row.expectedKept ? `, ${(row.kept ?? 0).toLocaleString('en')}/${row.expectedKept.toLocaleString('en')} kept` : '';
                return `${row.mutations.records.toLocaleString('en')}${kept}`;
            })]),
            align,
        );
        const failed = speed.filter((/** @type {any} */ row) => row.status === 'failed');
        if (failed.length) {
            console.log('Failed:\n');
            for (const row of failed) console.log(`- ${row.operation}, ${row.library}: ${escape(row.message ?? 'failed')}`);
            console.log();
        }
    }
}

if (failures?.length) {
    console.log('### Other failures\n');
    for (const failure of failures) console.log(`- ${failure.suite}${failure.browser ? ` (${failure.browser})` : ''}: ${escape(failure.message)}`);
}
