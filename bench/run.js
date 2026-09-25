#!/usr/bin/env node
/**
 * Runs the benchmark: installs and builds the stacks, starts them behind the
 * proxy, checks that each one conforms to the scenario, then measures them in
 * shuffled order, iteration after iteration, and writes one JSON file that
 * validates against schema/results.v1.json.
 *
 *   node run.js                           every stack, mobile profile, 15 iterations
 *   node run.js --stacks=static,cyclewire --profile=desktop --iterations=5
 *   node run.js --check                   conformance only; exits 1 if a stack fails
 *   node run.js --serve                   start everything and print the URLs
 *
 * Options: --kinds=journeys,early,repeat  --journeys=cart,filter,search,quickview,newsletter
 *          --seed=1  --out=<file>  --channel=chrome  --headed  --skip-build  --skip-conformance
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { certificate } from './proxy/cert.js';
import { POLICY } from './proxy/server.js';
import { launch } from './runner/browser.js';
import { conformance } from './runner/conformance.js';
import { cpuIndex, environment } from './runner/environment.js';
import { JOURNEYS } from './runner/journeys.js';
import { QUIET_MS, earlyVisit, journeyVisit, repeatVisit } from './runner/measure.js';
import { PROFILES, describe } from './runner/profiles.js';
import { available, load, prepare, start } from './runner/stacks.js';
import { summarizeSamples } from './runner/summary.js';
import { validate } from './runner/validate.js';
import { ensureImages } from './scenario/images.js';
import { prng, shuffle } from './scenario/random.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const KINDS = ['journeys', 'early', 'repeat'];

const { values: args } = parseArgs({
    options: {
        stacks: { type: 'string' },
        profile: { type: 'string', default: 'mobile' },
        iterations: { type: 'string', default: '15' },
        kinds: { type: 'string', default: KINDS.join(',') },
        journeys: { type: 'string', default: JOURNEYS.join(',') },
        seed: { type: 'string', default: '1' },
        out: { type: 'string' },
        channel: { type: 'string' },
        headed: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
        serve: { type: 'boolean', default: false },
        'skip-build': { type: 'boolean', default: false },
        'skip-conformance': { type: 'boolean', default: false },
    },
});

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const fail = (message) => {
    console.error(message);
    process.exit(2);
};
const list = (value, allowed, name) => {
    const items = value.split(',').map((item) => item.trim()).filter(Boolean);
    const unknown = items.filter((item) => !allowed.includes(item));
    if (unknown.length) fail(`Unknown ${name}: ${unknown.join(', ')}. Choose from ${allowed.join(', ')}.`);
    return items;
};

const profile = PROFILES[args.profile] ?? fail(`Unknown profile "${args.profile}". Choose from ${Object.keys(PROFILES).join(', ')}.`);
const stacks = list(args.stacks ?? available().join(','), available(), 'stacks').map(load);
const kinds = list(args.kinds, KINDS, 'kinds');
const journeys = list(args.journeys, JOURNEYS, 'journeys');
const iterations = Number(args.iterations);
const seed = Number(args.seed);
if (!Number.isInteger(iterations) || iterations < 1) fail('--iterations must be a positive integer');
if (!Number.isInteger(seed)) fail('--seed must be an integer');

await ensureImages({ log });
const { spki } = certificate();
for (const stack of stacks) await prepare(stack, { build: !args['skip-build'], log });
const servers = await start(stacks, { log });
const shutdown = async (code) => {
    await servers.stop();
    process.exit(code);
};
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

if (args.serve) {
    log('Open the URLs in Chrome started with');
    log(`  --ignore-certificate-errors-spki-list=${spki} --user-data-dir=<an empty folder>`);
    log('or accept the self-signed certificate. Ctrl+C stops.');
    await new Promise(() => {});
}

const browser = await launch({ spki, channel: args.channel, headed: args.headed });
let exitCode = 0;
try {
    const golden = JSON.parse(await readFile(`${ROOT}/scenario/golden.json`, 'utf8'));
    const checked = new Map();
    for (const stack of stacks) {
        log(`${stack.id}: checking conformance`);
        const result = await conformance({ browser, stack, golden, profile });
        checked.set(stack.id, result);
        for (const item of result.checks.filter((entry) => !entry.passed)) log(`${stack.id}: ✗ ${item.id}: ${item.detail}`);
        log(`${stack.id}: ${result.passed ? 'conforms' : 'does NOT conform'} (${result.checks.filter((entry) => entry.passed).length}/${result.checks.length} checks)`);
    }
    if (args.check) {
        exitCode = [...checked.values()].every((result) => result.passed) ? 0 : 1;
    } else {
        const measured = stacks.filter((stack) => checked.get(stack.id).passed || args['skip-conformance']);
        const environmentInfo = { ...environment(browser), cpuIndex: await cpuIndex(browser) };
        const startedAt = new Date();

        /** @type {Map<string, { cold: object[], repeat: object[], journeys: Record<string, object[]>, early: object[] }>} */
        const samples = new Map(measured.map((stack) => [stack.id, { cold: [], repeat: [], journeys: Object.fromEntries(journeys.map((id) => [id, []])), early: [] }]));
        const failures = [];
        const tasks = measured.flatMap((stack) => [
            ...(kinds.includes('journeys') ? journeys.map((journey) => ({ stack, kind: 'journey', journey })) : []),
            ...(kinds.includes('early') ? [{ stack, kind: 'early' }] : []),
            ...(kinds.includes('repeat') ? [{ stack, kind: 'repeat' }] : []),
        ]);

        const runTask = async ({ stack, kind, journey }, iteration) => {
            const base = { browser, profile, url: stack.url };
            const into = samples.get(stack.id);
            if (kind === 'journey') {
                const { cold, journey: result } = await journeyVisit({ ...base, journey, searchMode: stack.manifest.search });
                if (iteration >= 0) {
                    into.cold.push({ iteration, visit: journey, ...cold });
                    into.journeys[journey].push({ iteration, ...result });
                }
            } else if (kind === 'early') {
                const result = await earlyVisit(base);
                if (iteration >= 0) into.early.push({ iteration, ...result });
            } else {
                const result = await repeatVisit(base);
                if (iteration >= 0) into.repeat.push({ iteration, ...result });
            }
        };

        // One unrecorded pass, so servers and the proxy's compression cache are warm.
        log(`Warming up ${measured.length} stack(s)`);
        for (const task of tasks) await runTask(task, -1).catch((error) => log(`${task.stack.id}: warm-up ${task.kind} failed: ${error.message}`));

        const random = prng(seed);
        const measuring = Date.now();
        for (let iteration = 0; iteration < iterations; iteration++) {
            const began = Date.now();
            for (const task of shuffle(tasks, random)) {
                try {
                    await runTask(task, iteration);
                } catch (error) {
                    failures.push({ stack: task.stack.id, kind: task.kind, journey: task.journey ?? null, iteration, message: String(error.message).slice(0, 500) });
                    log(`${task.stack.id}: ${task.kind}${task.journey ? ` ${task.journey}` : ''} failed: ${error.message.split('\n')[0]}`);
                }
            }
            const each = (Date.now() - measuring) / (iteration + 1);
            log(`Iteration ${iteration + 1}/${iterations} took ${Math.round((Date.now() - began) / 1000)}s; about ${Math.round((each * (iterations - iteration - 1)) / 60000)} min left`);
        }

        const finishedAt = new Date();
        const results = {
            schema: 'cyclewire-bench/results@1',
            id: `${startedAt.toISOString().slice(0, 19).replace(/:/g, '-')}Z-${profile.id}`,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            profile: describe(profile),
            environment: environmentInfo,
            config: { iterations, seed, kinds, journeys, quietMs: QUIET_MS, delivery: POLICY },
            stacks: stacks.map((stack) => ({
                id: stack.id,
                name: stack.manifest.name,
                kind: stack.manifest.kind,
                summary: stack.manifest.summary,
                versions: stack.versions,
                search: stack.manifest.search,
                idioms: stack.manifest.idioms,
                response: stack.manifest.response ?? null,
                conformance: checked.get(stack.id),
                measured: samples.has(stack.id),
                samples: samples.get(stack.id) ?? null,
                summaries: samples.has(stack.id) ? summarizeSamples(samples.get(stack.id), seed) : null,
            })),
            failures,
        };
        const problems = validate(results);
        if (problems.length) {
            log(`The results do not match schema/results.v1.json:\n${problems.join('\n')}`);
            exitCode = 1;
        }
        const out = args.out ?? `${ROOT}/results/${startedAt.toISOString().slice(0, 10)}-${profile.id}.local.json`;
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
        log(`Wrote ${relative(process.cwd(), out)}${failures.length ? ` (${failures.length} failed visits)` : ''}`);
    }
} finally {
    await browser.close();
    await servers.stop();
}
process.exit(exitCode);
