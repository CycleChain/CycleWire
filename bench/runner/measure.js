/**
 * Visits: each opens a fresh browser context (empty cache, no cookies),
 * applies the profile's network and CPU throttling through CDP, loads the
 * page and records what happened.
 *
 * - journey:  a cold load, then one interaction once the page has settled.
 * - early:    a cold load, with "Add to cart" tapped as soon as it is painted,
 *             or a set time after that.
 * - repeat:   a cold load, then a second load of the same page with a warm cache.
 */
import { EARLY, perform } from './journeys.js';
import { press, sleep } from './input.js';
import { bytes, categoryOf, recordNetwork } from './network.js';
import { PROBE } from './probe.js';
import { contextOptions, networkConditions } from './profiles.js';

/** A page is settled after this long with no request in flight and no long task. */
export const QUIET_MS = 1000;
const SETTLE_TIMEOUT = 30_000;
const EFFECT_TIMEOUT = 20_000;
/** Lighthouse's threshold for a blocking task. */
const BLOCKING = 50;

/**
 * @param {object} options
 * @param {import('playwright').Browser} options.browser
 * @param {object} options.profile
 * @param {boolean} [options.throttle]
 * @param {boolean} [options.javaScript]
 */
export async function open({ browser, profile, throttle = true, javaScript = true }) {
    const context = await browser.newContext({ ...contextOptions(profile, browser.version()), javaScriptEnabled: javaScript });
    await context.addInitScript({ content: PROBE });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const network = await recordNetwork(cdp);
    if (throttle) {
        // With netem the network is shaped below the browser (runner/netem.js).
        if (profile.shaping !== 'netem') await cdp.send('Network.emulateNetworkConditions', networkConditions(profile));
        if (profile.cpuSlowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    }
    await cdp.send('Performance.enable');
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return { context, page, cdp, network, errors, close: () => context.close() };
}

/** Waits until the page is loaded and quiet: no request in flight and no long task for `quietMs`. */
export async function settle({ page, network }, { quietMs = QUIET_MS, timeoutMs = SETTLE_TIMEOUT } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const quiet = await page.evaluate((ms) => (window.__bench ? window.__bench.quiet(ms) : document.readyState === 'complete'), quietMs).catch(() => false);
        if (quiet && network.inflight === 0 && Date.now() - network.lastActivity >= quietMs) return true;
        await sleep(100);
    }
    return false;
}

async function metrics(cdp) {
    const { metrics: list } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(list.map(({ name, value }) => [name, value]));
}

/** Total Blocking Time between two points, the way Lighthouse clips tasks to the window. */
export function blockingTime(tasks, from, to) {
    let total = 0;
    for (const [start, duration] of tasks) {
        const end = start + duration;
        const clippedStart = Math.max(start, from);
        const clippedEnd = Math.min(end, to);
        if (clippedEnd - clippedStart < BLOCKING) continue;
        total += Math.max(duration - BLOCKING - (clippedStart - start) - (end - clippedEnd), 0);
    }
    return total;
}

const round = (value, digits = 1) => (value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/**
 * Heap, DOM nodes and event listeners, after a garbage collection: Chrome
 * counts removed listeners and dead objects until they are collected.
 */
async function memory(cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    const values = await metrics(cdp);
    return { heap: values.JSHeapUsedSize ?? null, nodes: values.Nodes ?? null, listeners: values.JSEventListeners ?? null };
}

/** Loads `url` in the session and describes the load once it settles. */
async function load(session, url) {
    const { page, cdp, network } = session;
    const mark = network.requests.length;
    const before = await metrics(cdp);
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    const quiet = await settle(session);
    const snapshot = await page.evaluate(() => window.__bench.snapshot());
    const after = await metrics(cdp);
    const requests = network.requests.slice(mark);
    const document = requests.find((request) => categoryOf(request) === 'document');
    const ms = (name) => round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000);
    return {
        // Under DevTools throttling the emulated latency is added when the
        // response is delivered, so Navigation Timing's responseStart only
        // shows the server; the protocol's own timestamps include the latency.
        ttfb: document?.responseAt ? round((document.responseAt - document.sentAt) * 1000) : null,
        server: round(snapshot.server),
        fcp: round(snapshot.fcp),
        lcp: round(snapshot.lcp),
        lcpElement: snapshot.lcpElement,
        cls: round(snapshot.cls, 4),
        tbt: round(snapshot.fcp === null ? null : blockingTime(snapshot.longTasks, snapshot.fcp, snapshot.settled)),
        longTasks: snapshot.longTasks.length,
        domContentLoaded: round(snapshot.domContentLoaded),
        load: round(snapshot.load),
        settled: round(snapshot.settled),
        quiet,
        mainThread: { task: ms('TaskDuration'), script: ms('ScriptDuration'), layout: ms('LayoutDuration'), style: ms('RecalcStyleDuration') },
        protocol: document?.protocol ?? null,
        requests: requests.length,
        bytes: bytes(requests),
    };
}

async function waitForEffect(page, timeoutMs = EFFECT_TIMEOUT) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const effect = await page.evaluate(() => (window.__bench ? window.__bench.effect : null)).catch(() => null);
        if (effect) return effect;
        await sleep(50);
    }
    return null;
}

/** The longest Event Timing duration of the interactions from `inputAt` on. */
async function interactionDelay(page, inputAt) {
    return page.evaluate((at) => {
        const bench = window.__bench;
        const origin = performance.timeOrigin;
        const durations = bench.events.filter((entry) => origin + entry.start >= at - 1).map((entry) => entry.duration);
        return durations.length ? Math.max(...durations) : null;
    }, inputAt).catch(() => null);
}

/** A cold load and nothing else, to compare with another tool's (crosscheck/). */
export async function coldVisit({ browser, profile, url }) {
    const session = await open({ browser, profile });
    try {
        return await load(session, url);
    } finally {
        await session.close();
    }
}

/**
 * A cold load, then one journey.
 * @param {{ browser: import('playwright').Browser, profile: object, url: string, journey: string, searchMode: 'live' | 'submit' }} options
 */
export async function journeyVisit({ browser, profile, url, journey, searchMode }) {
    const session = await open({ browser, profile });
    try {
        const cold = await load(session, url);
        const { page, cdp, network } = session;
        let mark = network.requests.length;
        await perform(journey, {
            page, cdp, input: profile.input, searchMode,
            settle: () => settle(session, { quietMs: QUIET_MS / 2 }),
            onArm: () => { mark = network.requests.length; },
        });
        const effect = await waitForEffect(page);
        await settle(session);
        const requests = network.requests.slice(mark);
        const used = bytes(requests);
        return {
            cold,
            journey: {
                effect: effect ? round(effect.at - effect.inputAt) : null,
                navigated: effect ? effect.navigated : null,
                inp: effect && !effect.navigated ? round(await interactionDelay(page, effect.inputAt)) : null,
                requests: requests.length,
                bytes: { transfer: used.total.transfer, script: used.script.transfer },
                errors: session.errors.slice(0, 5),
            },
        };
    } finally {
        await session.close();
    }
}

/**
 * A cold load with "Add to cart" tapped the moment it is painted, or `offset`
 * ms after that. The wait runs outside the page, as a person's does: a tap
 * lands on time even while the page's main thread is busy, where the button
 * was painted.
 * @param {{ browser: import('playwright').Browser, profile: object, url: string, offset?: number }} options
 */
export async function earlyVisit({ browser, profile, url, offset = 0 }) {
    const session = await open({ browser, profile });
    try {
        const { page, cdp } = session;
        await page.goto(url, { waitUntil: 'commit', timeout: 90_000 });
        // Resolves in the page, in the first frame after first paint where the button is visible.
        const found = await page.evaluate(({ scope, text, condition }) => new Promise((resolve) => {
            const started = performance.now();
            const tick = () => {
                const bench = window.__bench;
                const button = bench && bench.fcp !== null
                    ? [...(document.querySelector(scope)?.querySelectorAll('button, input[type="submit"]') ?? [])].find((el) => (el.textContent.trim() === text || el.getAttribute('value') === text) && el.getClientRects().length > 0)
                    : null;
                if (button) {
                    const rect = button.getBoundingClientRect();
                    if (rect.bottom > 0 && rect.top < innerHeight) {
                        bench.arm(condition[0], condition[1]);
                        resolve({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, fcp: bench.fcp, origin: performance.timeOrigin, at: performance.timeOrigin + performance.now() });
                        return;
                    }
                }
                if (performance.now() - started > 60_000) resolve(null);
                else requestAnimationFrame(tick);
            };
            tick();
        }), EARLY);
        if (!found) return { outcome: 'error', offset, error: 'The button never appeared', tapAt: null, sinceFcp: null, effect: null };
        // Both clocks are the machine's wall clock.
        const wait = found.at + offset - Date.now();
        if (wait > 0) await sleep(wait);
        await press(page, cdp, profile.input, found);
        const effect = await waitForEffect(page);
        await settle(session);
        const count = await page.evaluate(() => document.getElementById('cart-count')?.textContent?.trim() ?? null).catch(() => null);
        // The tap is timed in the first document, whose time origin found holds.
        const inputAt = effect?.inputAt ?? null;
        const tapAt = inputAt === null ? null : round(inputAt - found.origin);
        let outcome;
        if (count !== null && Number(count) > 1) outcome = 'duplicate';
        else if (effect) outcome = effect.navigated ? 'navigation' : 'effect';
        else outcome = count === '0' ? 'lost' : 'error';
        return {
            outcome,
            offset,
            fcp: round(found.fcp),
            tapAt,
            sinceFcp: tapAt === null ? null : round(tapAt - found.fcp),
            effect: effect ? round(effect.at - effect.inputAt) : null,
            count,
            errors: session.errors.slice(0, 5),
        };
    } finally {
        await session.close();
    }
}

/**
 * A cold load, then the same page again with the cache it left behind. The
 * memory figures are read after the first load, once it has settled and
 * garbage has been collected.
 */
export async function repeatVisit({ browser, profile, url }) {
    const session = await open({ browser, profile });
    try {
        await load(session, url);
        const settledMemory = await memory(session.cdp);
        return { ...(await load(session, url)), memory: settledMemory };
    } finally {
        await session.close();
    }
}
