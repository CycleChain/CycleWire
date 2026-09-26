/**
 * The morph suite, in Chromium, Firefox and WebKit through Playwright. Each
 * library gets a page of its own (in a context of its own), loaded from the
 * local server; nothing comes from the network.
 *
 * Correctness: every case in a freshly loaded page, per library and browser.
 * Speed: per operation, one untimed pass with a MutationObserver, then
 * warm-up and samples, the libraries in a shuffled order in every round so
 * that a slow moment on the machine does not land on one of them. Every
 * sample morphs a fresh copy of the rows, and is checked against the target.
 */
import { chromium, firefox, webkit } from 'playwright';
import { summarize } from '../../runner/stats.js';
import { prng, shuffle } from '../../scenario/random.js';
import { startServer } from './server.js';

const ENGINES = { chromium, firefox, webkit };

// As the harness does (runner/browser.js): keep background work away from the
// page. --expose-gc lets the page collect garbage before every sample.
const CHROMIUM_ARGS = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--js-flags=--expose-gc',
];

/** A step in the page that takes longer than this has hung. */
const STEP_TIMEOUT_MS = 120_000;

const firstLine = (/** @type {unknown} */ error) => String(/** @type {Error} */ (error)?.message ?? error).split('\n')[0].slice(0, 300);

/**
 * @template T
 * @param {Promise<T>} promise @param {string} what
 * @returns {Promise<T>}
 */
function withTimeout(promise, what) {
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${what} took longer than ${STEP_TIMEOUT_MS / 1000} s`)), STEP_TIMEOUT_MS);
        }),
    ]);
}

/**
 * @param {object} options
 * @param {string[]} options.browsers
 * @param {import('./adapters.js').MorphLibrary[]} options.libraries
 * @param {import('./cases.js').Case[]} options.cases
 * @param {import('./rows.js').Operation[]} options.operations
 * @param {number} options.samples
 * @param {number} options.warmup
 * @param {number} options.seed
 * @param {string} [options.channel]  for Chromium: e.g. "chrome" for an installed Chrome
 * @param {(message: string) => void} options.log
 */
export async function runMorph({ browsers, libraries, cases, operations, samples, warmup, seed, channel, log }) {
    const server = await startServer();
    /** @type {any[]} */
    const browserInfo = [];
    /** @type {any[]} */
    const correctness = [];
    /** @type {any[]} */
    const speed = [];
    /** @type {any[]} */
    const failures = [];
    try {
        for (const name of browsers) {
            const engine = ENGINES[/** @type {keyof typeof ENGINES} */ (name)];
            /** @type {import('playwright').Browser} */
            let browser;
            try {
                browser = await engine.launch(name === 'chromium' ? { channel: channel || 'chromium', args: CHROMIUM_ARGS } : {});
            } catch (error) {
                failures.push({ suite: 'morph', browser: name, message: `could not launch ${name}: ${firstLine(error)}` });
                log(`morph: could not launch ${name}: ${firstLine(error)}`);
                continue;
            }
            /** @type {string[]} */
            const errors = [];
            try {
                /** @type {Map<string, import('playwright').Page>} */
                const pages = new Map();
                const newPage = async (/** @type {string} */ id) => {
                    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
                    const page = await context.newPage();
                    page.on('pageerror', (error) => errors.push(`${id}: ${firstLine(error)}`));
                    pages.set(id, page);
                    return page;
                };
                /** Loads the page for a library, fresh. @param {string} id */
                const open = async (id) => {
                    const page = pages.get(id) ?? (await newPage(id));
                    await page.goto(`${server.url}/?lib=${id}`);
                    await page.waitForFunction(() => /** @type {any} */ (globalThis).micro?.ready === true, null, { timeout: 30_000 });
                    return page;
                };
                /** After a hang, the page is gone for good: start another. @param {string} id */
                const replace = async (id) => {
                    await pages.get(id)?.context().close().catch(() => {});
                    pages.delete(id);
                    return open(id);
                };

                const first = await open(libraries[0].id);
                const info = await first.evaluate(() => /** @type {any} */ (globalThis).micro.info());
                browserInfo.push({ name, channel: name === 'chromium' ? channel || 'chromium' : null, version: browser.version(), ...info });
                log(`morph: ${name} ${browser.version()}, timer resolution ${info.timerResolutionMs} ms${info.crossOriginIsolated ? ' (cross-origin isolated)' : ''}${info.gc ? ', gc() between samples' : ''}`);

                for (const entry of cases) {
                    for (const library of libraries) {
                        try {
                            const page = await open(library.id);
                            const result = await withTimeout(page.evaluate((id) => /** @type {any} */ (globalThis).micro.runCase(id), entry.id), `case ${entry.id}`);
                            correctness.push({ browser: name, library: library.id, case: entry.id, pass: result.pass, problems: result.problems });
                        } catch (error) {
                            correctness.push({ browser: name, library: library.id, case: entry.id, pass: false, problems: [`the test page failed: ${firstLine(error)}`] });
                            await replace(library.id).catch(() => {});
                        }
                    }
                }
                const passed = correctness.filter((row) => row.browser === name && row.pass).length;
                log(`morph: ${name}: ${passed} of ${cases.length * libraries.length} case results pass`);

                for (const library of libraries) await open(library.id);
                const random = prng(seed);
                for (const operation of operations) {
                    /** @type {Map<string, any>} */
                    const records = new Map();
                    for (const library of libraries) {
                        const record = { browser: name, library: library.id, operation: operation.id, samples: /** @type {number[]} */ ([]), withLayout: /** @type {number[]} */ ([]), mutations: null, kept: null, expectedKept: null, problem: /** @type {string | null} */ (null) };
                        records.set(library.id, record);
                        try {
                            const page = /** @type {import('playwright').Page} */ (pages.get(library.id));
                            const counted = await withTimeout(page.evaluate((id) => /** @type {any} */ (globalThis).micro.mutations(id), operation.id), `${operation.id}`);
                            const { ok, problem, kept, expectedKept, ...mutations } = counted;
                            record.mutations = mutations;
                            record.kept = kept;
                            record.expectedKept = expectedKept;
                            if (!ok) record.problem = problem;
                        } catch (error) {
                            record.problem = `the test page failed: ${firstLine(error)}`;
                            await replace(library.id).catch(() => {});
                        }
                    }
                    for (let round = 0; round < warmup + samples; round++) {
                        for (const library of shuffle(libraries, random)) {
                            const record = records.get(library.id);
                            if (record.problem?.startsWith('the test page failed')) continue;
                            try {
                                const page = /** @type {import('playwright').Page} */ (pages.get(library.id));
                                const result = await withTimeout(page.evaluate((id) => /** @type {any} */ (globalThis).micro.sample(id), operation.id), `${operation.id}`);
                                if (!result.ok) record.problem ??= result.problem;
                                if (round < warmup) continue;
                                record.samples.push(result.ms);
                                record.withLayout.push(result.withLayout);
                            } catch (error) {
                                record.problem = `the test page failed: ${firstLine(error)}`;
                                await replace(library.id).catch(() => {});
                            }
                        }
                    }
                    for (const record of records.values()) {
                        const ok = !record.problem;
                        speed.push({
                            browser: record.browser,
                            library: record.library,
                            operation: record.operation,
                            status: ok ? 'ok' : 'failed',
                            ...(ok ? {} : { message: record.problem }),
                            samples: record.samples,
                            withLayout: record.withLayout,
                            summary: ok ? summarize(record.samples, { seed }) : null,
                            summaryWithLayout: ok ? summarize(record.withLayout, { seed }) : null,
                            mutations: record.mutations,
                            kept: record.kept,
                            expectedKept: record.expectedKept,
                        });
                    }
                    const medians = [...records.values()].map((record) => `${record.library} ${record.problem ? 'failed' : `${summarize(record.samples).median} ms`}`);
                    log(`morph: ${name} ${operation.id}: ${medians.join(', ')}`);
                }
            } catch (error) {
                // Whatever was measured in this browser is kept; the others still run.
                failures.push({ suite: 'morph', browser: name, message: `the ${name} run stopped: ${firstLine(error)}` });
                log(`morph: the ${name} run stopped: ${firstLine(error)}`);
            } finally {
                for (const error of errors) failures.push({ suite: 'morph', browser: name, message: `page error: ${error}` });
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    return { browsers: browserInfo, correctness, speed, failures };
}
