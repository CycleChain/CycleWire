#!/usr/bin/env node
/**
 * Micro benchmarks: CycleWire's signals and morph next to libraries that do
 * the same job, each used through its documented API with its defaults.
 * Writes one JSON file that validates against ../schema/micro.v1.json;
 * report.js prints it as Markdown tables.
 *
 *   cd bench/micro && npm ci          (build CycleWire first: npm run build in the repository root)
 *   node run.js --suite=signals --samples=5
 *   node run.js --suite=morph --browsers=chromium --samples=5
 *   node run.js                       both suites, all three browsers, 15 samples
 *
 * Options: --suite=signals|morph|all  --browsers=chromium,firefox,webkit
 *          --samples=15  --warmup=3  --seed=1  --out=<file>  --channel=chrome
 *          --libraries=<ids>  --scenarios=<ids>  --cases=<ids>  --operations=<ids>
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { installedVersion, machine } from './environment.js';
import { LIBRARIES as MORPH_LIBRARIES } from './morph/adapters.js';
import { CASES } from './morph/cases.js';
import { OPERATIONS } from './morph/rows.js';
import { runMorph } from './morph/run.js';
import { LIBRARIES as SIGNAL_LIBRARIES } from './signals/adapters.js';
import { runSignals } from './signals/run.js';
import { SCENARIOS } from './signals/scenarios.js';
import { validate } from './validate.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BROWSERS = ['chromium', 'firefox', 'webkit'];

const { values: args } = parseArgs({
    options: {
        suite: { type: 'string', default: 'all' },
        browsers: { type: 'string', default: BROWSERS.join(',') },
        samples: { type: 'string', default: '15' },
        warmup: { type: 'string', default: '3' },
        seed: { type: 'string', default: '1' },
        out: { type: 'string' },
        channel: { type: 'string' },
        libraries: { type: 'string' },
        scenarios: { type: 'string' },
        cases: { type: 'string' },
        operations: { type: 'string' },
    },
});

const log = (/** @type {string} */ message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const fail = (/** @type {string} */ message) => {
    console.error(message);
    process.exit(2);
};
/**
 * @template {{ id: string }} T
 * @param {string | undefined} value @param {T[]} all @param {string} name
 */
const pick = (value, all, name) => {
    if (value === undefined) return all;
    const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !all.some((item) => item.id === id));
    if (unknown.length) fail(`Unknown ${name}: ${unknown.join(', ')}. Choose from ${all.map((item) => item.id).join(', ')}.`);
    return all.filter((item) => ids.includes(item.id));
};
const count = (/** @type {string} */ value, /** @type {string} */ name, min = 1) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min) fail(`--${name} must be a whole number of at least ${min}`);
    return number;
};

const suites = args.suite === 'all' ? ['signals', 'morph'] : [args.suite];
if (!suites.every((suite) => suite === 'signals' || suite === 'morph')) fail('--suite must be signals, morph or all');
const browsers = args.browsers.split(',').map((item) => item.trim()).filter(Boolean);
const unknownBrowsers = browsers.filter((name) => !BROWSERS.includes(name));
if (unknownBrowsers.length || !browsers.length) fail(`--browsers takes ${BROWSERS.join(', ')}`);
const samples = count(args.samples, 'samples');
const warmup = count(args.warmup, 'warmup', 0);
const seed = count(args.seed, 'seed', 0);

// --libraries names ids from either suite; each suite keeps the ones it has.
const libraryIds = args.libraries?.split(',').map((item) => item.trim()).filter(Boolean);
if (libraryIds) {
    const known = new Set([...SIGNAL_LIBRARIES, ...MORPH_LIBRARIES].map((library) => library.id));
    const unknown = libraryIds.filter((id) => !known.has(id));
    if (unknown.length) fail(`Unknown libraries: ${unknown.join(', ')}. Choose from ${[...known].join(', ')}.`);
}
const signalLibraries = libraryIds ? SIGNAL_LIBRARIES.filter((library) => libraryIds.includes(library.id)) : SIGNAL_LIBRARIES;
const morphLibraries = libraryIds ? MORPH_LIBRARIES.filter((library) => libraryIds.includes(library.id)) : MORPH_LIBRARIES;
const scenarios = pick(args.scenarios, SCENARIOS, 'scenarios');
const cases = pick(args.cases, CASES, 'cases');
const operations = pick(args.operations, OPERATIONS, 'operations');
if (suites.includes('signals') && !signalLibraries.length) fail('No signal library selected');
if (suites.includes('morph') && !morphLibraries.length) fail('No morph library selected');

const startedAt = new Date();
const out = resolve(args.out ?? `${ROOT}/out/${startedAt.toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
const environmentInfo = machine();
log(`Micro benchmarks: ${suites.join(' and ')}, ${samples} samples after ${warmup} warm-up, on ${environmentInfo.cpu} (load ${environmentInfo.loadAverage.join(' / ')})`);

/** @type {any[]} */
const failures = [];
let signals = null;
if (suites.includes('signals')) {
    const results = await runSignals({ libraries: signalLibraries, scenarios, samples, warmup, seed, log });
    signals = {
        libraries: signalLibraries.map(({ id, name, package: pkg, module, batching, api, note }) => ({ id, name, package: pkg, version: installedVersion(pkg), module, batching, api, ...(note ? { note } : {}) })),
        scenarios: scenarios.map(({ id, group, title, measures, checks }) => ({ id, group, title, measures, checks })),
        results,
    };
}

let morph = null;
if (suites.includes('morph')) {
    const results = await runMorph({ browsers, libraries: morphLibraries, cases, operations, samples, warmup, seed, channel: args.channel, log });
    failures.push(...results.failures);
    morph = {
        libraries: morphLibraries.map(({ id, name, package: pkg, call, options, defaults }) => ({ id, name, package: pkg, version: installedVersion(pkg), call, options, defaults })),
        browsers: results.browsers,
        cases: cases.map(({ id, title, want, why, design }) => ({ id, title, want, why, ...(design ? { design } : {}) })),
        operations: operations.map(({ id, title, from }) => ({ id, title, rows: from ? from.length : 0 })),
        correctness: results.correctness,
        speed: results.speed,
    };
}

const final = {
    schema: 'cyclewire-bench/micro@1',
    id: `${startedAt.toISOString().slice(0, 19).replace(/:/g, '-')}Z-micro`,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    environment: { ...environmentInfo, loadAverageEnd: loadavg().map((value) => Math.round(value * 100) / 100) },
    config: { suites, samples, warmup, seed, ...(suites.includes('morph') ? { browsers, channel: args.channel ?? null } : {}) },
    signals,
    morph,
    failures,
};

let exitCode = 0;
const problems = validate(final);
if (problems.length) {
    log(`The results do not match ../schema/micro.v1.json:\n${problems.join('\n')}`);
    exitCode = 1;
}
await mkdir(dirname(out), { recursive: true });
await writeFile(`${out}.tmp`, `${JSON.stringify(final)}\n`);
await rename(`${out}.tmp`, out);
const failed = [...(signals?.results ?? []), ...(morph?.speed ?? [])].filter((result) => result.status === 'failed').length + (morph?.correctness ?? []).filter((row) => !row.pass).length;
log(`Wrote ${relative(process.cwd(), out)}${failed ? ` (${failed} failed checks or cases; see node report.js ${relative(process.cwd(), out)})` : ''}`);
process.exit(exitCode);