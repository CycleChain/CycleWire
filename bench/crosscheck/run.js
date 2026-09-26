#!/usr/bin/env node
/**
 * Checks the harness's load metrics against Lighthouse's. On one machine, with
 * every stack behind the same proxy, it alternates the harness's cold load
 * (runner/measure.js) with a Lighthouse navigation under the same conditions:
 * DevTools throttling with the profile's numbers, which are Lighthouse's own,
 * the same screen, and an empty cache. Then it compares the medians of FCP,
 * LCP, TBT and CLS.
 *
 *   cd bench/crosscheck && npm ci
 *   node run.js --profile=mobile --runs=5 [--stacks=static,cyclewire] [--out=file.json] [--channel=chrome]
 *
 * The two measure TBT over different windows: Lighthouse from FCP to Time to
 * Interactive, the harness from FCP until the page settles. Both count the
 * part of each long task beyond 50 ms.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { launch as launchChrome } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { certificate } from '../proxy/cert.js';
import { launch } from '../runner/browser.js';
import { environment } from '../runner/environment.js';
import { coldVisit } from '../runner/measure.js';
import { PROFILES, contextOptions, describe, networkConditions } from '../runner/profiles.js';
import { available, load, prepare, start } from '../runner/stacks.js';
import { summarize } from '../runner/stats.js';
import { ensureImages } from '../scenario/images.js';
import { prng, shuffle } from '../scenario/random.js';

/** What both tools measure, and where Lighthouse keeps it. */
const METRICS = {
    fcp: 'first-contentful-paint',
    lcp: 'largest-contentful-paint',
    tbt: 'total-blocking-time',
    cls: 'cumulative-layout-shift',
};

const { values: args } = parseArgs({
    options: {
        stacks: { type: 'string' },
        profile: { type: 'string', default: 'mobile' },
        runs: { type: 'string', default: '5' },
        seed: { type: 'string', default: '1' },
        out: { type: 'string' },
        channel: { type: 'string' },
        'skip-build': { type: 'boolean', default: false },
    },
});
const fail = (message) => {
    console.error(message);
    process.exit(2);
};
const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

const profile = PROFILES[args.profile] ?? fail(`Unknown profile "${args.profile}". Choose from ${Object.keys(PROFILES).join(', ')}.`);
const runs = Number(args.runs);
if (!Number.isInteger(runs) || runs < 1) fail('--runs must be a positive integer');
const ids = (args.stacks ?? available().join(',')).split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !available().includes(id));
if (unknown.length) fail(`Unknown stacks: ${unknown.join(', ')}`);
const stacks = ids.map(load);

/** Lighthouse's settings for the profile: the harness's throttling, screen and user agent. */
function settings(browserVersion) {
    const conditions = networkConditions(profile);
    const { viewport, deviceScaleFactor, isMobile } = profile.context;
    const userAgent = contextOptions(profile, browserVersion).userAgent;
    return {
        onlyCategories: ['performance'],
        formFactor: isMobile ? 'mobile' : 'desktop',
        screenEmulation: { mobile: isMobile, width: viewport.width, height: viewport.height, deviceScaleFactor, disabled: false },
        emulatedUserAgent: userAgent ?? false,
        throttlingMethod: 'devtools',
        throttling: {
            rttMs: profile.network.rttMs,
            throughputKbps: profile.network.downloadKbps,
            requestLatencyMs: conditions.latency,
            downloadThroughputKbps: (conditions.downloadThroughput * 8) / 1024,
            uploadThroughputKbps: (conditions.uploadThroughput * 8) / 1024,
            cpuSlowdownMultiplier: profile.cpuSlowdown,
        },
    };
}

await ensureImages({ log });
const { spki } = certificate();
for (const stack of stacks) await prepare(stack, { build: !args['skip-build'], log });
const servers = await start(stacks, { log });
const browser = await launch({ spki, channel: args.channel });
const machine = environment(browser);
const lighthouseVersion = JSON.parse(await readFile(new URL('node_modules/lighthouse/package.json', import.meta.url), 'utf8')).version;
const config = { extends: 'lighthouse:default', settings: settings(browser.version()) };

/** One Lighthouse navigation in a Chrome of its own, with a fresh profile. */
async function audit(url) {
    const chrome = await launchChrome({
        // Playwright's Chromium, the harness's browser, unless an installed Chrome is asked for.
        chromePath: args.channel === 'chrome' ? undefined : chromium.executablePath(),
        chromeFlags: [
            '--headless=new',
            `--ignore-certificate-errors-spki-list=${spki}`,
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-extensions',
            '--no-first-run',
            ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
    });
    try {
        const result = await lighthouse(url, { port: chrome.port, logLevel: 'error', output: 'json' }, config);
        const { audits, runtimeError, runWarnings } = result.lhr;
        if (runtimeError) throw new Error(`Lighthouse: ${runtimeError.code} ${runtimeError.message}`);
        return { ...Object.fromEntries(Object.entries(METRICS).map(([id, audit]) => [id, audits[audit]?.numericValue ?? null])), warnings: runWarnings };
    } finally {
        chrome.kill();
    }
}

const startedAt = new Date();
const samples = new Map(stacks.map((stack) => [stack.id, { harness: [], lighthouse: [] }]));
const failures = [];
const random = prng(Number(args.seed));
try {
    const tasks = stacks.flatMap((stack) => [{ stack, tool: 'harness' }, { stack, tool: 'lighthouse' }]);
    // One unrecorded pass warms the servers and the proxy's compression cache.
    log(`Warming up ${stacks.length} stack(s)`);
    for (const { stack } of tasks.filter((task) => task.tool === 'harness')) await coldVisit({ browser, profile, url: stack.url }).catch(() => {});
    for (let run = 0; run < runs; run++) {
        for (const { stack, tool } of shuffle(tasks, random)) {
            try {
                const sample = tool === 'harness'
                    ? await coldVisit({ browser, profile, url: stack.url })
                    : await audit(stack.url);
                samples.get(stack.id)[tool].push({ run, ...Object.fromEntries(Object.keys(METRICS).map((id) => [id, sample[id] ?? null])) });
            } catch (error) {
                failures.push({ stack: stack.id, tool, run, message: String(error.message).slice(0, 500) });
                log(`${stack.id}: ${tool} failed: ${error.message.split('\n')[0]}`);
            }
        }
        log(`Run ${run + 1}/${runs} done`);
    }
} finally {
    await browser.close().catch(() => {});
    await servers.stop();
}

const summary = (list, id) => summarize(list.map((sample) => sample[id]), { seed: Number(args.seed) });
const results = {
    schema: 'cyclewire-bench/crosscheck@1',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    profile: describe(profile),
    environment: { ...machine, lighthouse: lighthouseVersion },
    runs,
    stacks: stacks.map((stack) => {
        const { harness, lighthouse: audited } = samples.get(stack.id);
        return {
            id: stack.id,
            name: stack.manifest.name,
            samples: { harness, lighthouse: audited },
            summaries: Object.fromEntries(Object.keys(METRICS).map((id) => [id, { harness: summary(harness, id), lighthouse: summary(audited, id) }])),
        };
    }),
    failures,
};
const out = args.out ?? `../results/crosscheck-${results.startedAt.slice(0, 10)}-${profile.id}.local.json`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(results)}\n`);

// A Markdown table: each metric's two medians, and how far Lighthouse's is from the harness's.
const format = (id, value) => (value === null ? '–' : id === 'cls' ? value.toFixed(3) : `${Math.round(value)}`);
const gap = (ours, theirs) => (ours === null || theirs === null || ours === 0 ? '' : ` (${theirs >= ours ? '+' : ''}${Math.round(((theirs - ours) / ours) * 100)}%)`);
const rows = results.stacks.map((stack) => `| ${stack.name} | ${Object.keys(METRICS).map((id) => {
    const { harness, lighthouse: audited } = stack.summaries[id];
    return `${format(id, harness.median)} / ${format(id, audited.median)}${gap(harness.median, audited.median)}`;
}).join(' | ')} |`);
const table = [
    `### Harness and Lighthouse ${lighthouseVersion}, ${profile.label}`,
    '',
    `Medians of ${runs} runs each, harness / Lighthouse (difference). Times in ms.`,
    '',
    `| Stack | ${Object.keys(METRICS).map((id) => id.toUpperCase()).join(' | ')} |`,
    `| --- | ${Object.keys(METRICS).map(() => '---:').join(' | ')} |`,
    ...rows,
    '',
    failures.length ? `${failures.length} runs failed.` : '',
].join('\n');
console.log(`\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
log(`Wrote ${out}`);
process.exit(0);
