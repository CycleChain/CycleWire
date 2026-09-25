/**
 * Conformance: a stack's numbers are only recorded if it builds the same
 * page and plays by the same rules. Everything here runs without throttling.
 */
import { formatPrice } from '../scenario/markup.js';
import { products } from '../scenario/catalog.js';
import { EXPECTED, JOURNEYS, perform } from './journeys.js';
import { categoryOf } from './network.js';
import { probe } from './probe.js';
import { open, settle } from './measure.js';

/** Inline <style> a framework may add for its own runtime, in bytes. */
export const INLINE_STYLE_LIMIT = 512;
const DYNAMIC_CART = { p02: 2, p07: 1 };

/** Compares visible text ignoring whitespace, and says where it first differs. */
export function sameText(actual, expected) {
    const a = actual.replace(/\s+/g, '');
    const b = expected.replace(/\s+/g, '');
    if (a === b) return null;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const around = (text) => JSON.stringify(text.slice(Math.max(0, i - 40), i + 40));
    return `differs at character ${i}: got ${around(a)}, expected ${around(b)}`;
}

function compareTexts(texts, golden) {
    return sameText(texts.page, golden.page) ?? (sameText(texts.dialog, golden.dialog) && `quick view ${sameText(texts.dialog, golden.dialog)}`);
}

/** Visible texts, even with JavaScript disabled in the page (the probe runs in the evaluation world). */
const readTexts = (page) => page.evaluate(`(${probe})(); window.__bench.texts()`);

/**
 * @param {object} options
 * @param {import('playwright').Browser} options.browser
 * @param {import('./stacks.js').Stack} options.stack
 * @param {object} options.golden scenario/golden.json
 * @param {object} options.profile the profile whose viewport and input to use
 * @returns {Promise<{ passed: boolean, checks: Array<{ id: string, passed: boolean, detail: string }> }>}
 */
export async function conformance({ browser, stack, golden, profile }) {
    const checks = [];
    const check = (id, problem) => checks.push({ id, passed: !problem, detail: problem || '' });
    const url = stack.url;
    const origin = new URL(url).origin;

    // 1. The server renders the page, per request, without JavaScript.
    {
        const session = await open({ browser, profile, throttle: false, javaScript: false });
        try {
            await session.page.goto(url, { waitUntil: 'load' });
            check('renders-without-javascript', compareTexts(await readTexts(session.page), golden.states.initial));

            await session.context.addCookies([{ name: 'cart', value: encodeURIComponent(JSON.stringify(DYNAMIC_CART)), url: origin }]);
            await session.page.goto(url, { waitUntil: 'load' });
            const [count, total] = await session.page.evaluate(() => ['cart-count', 'cart-total'].map((id) => document.getElementById(id)?.textContent?.trim() ?? null));
            const expectedTotal = formatPrice(Object.entries(DYNAMIC_CART).reduce((sum, [id, quantity]) => sum + products.find((product) => product.id === id).price * quantity, 0));
            check('renders-per-request', count === '3' && total === expectedTotal ? null : `with a cart cookie of three items the header shows ${count} and ${total}, expected 3 and ${expectedTotal}`);
        } finally {
            await session.close();
        }
    }

    // 2. With JavaScript, once settled: the same text, and the delivery rules.
    {
        const session = await open({ browser, profile, throttle: false });
        try {
            const { page, network } = session;
            await page.goto(url, { waitUntil: 'load' });
            await settle(session);
            check('same-text-after-scripts-run', compareTexts(await page.evaluate(() => window.__bench.texts()), golden.states.initial));

            const requests = network.requests.filter((request) => !request.failed);
            const document = requests.find((request) => categoryOf(request) === 'document');
            check('http2', document?.protocol === 'h2' ? null : `the page came over ${document?.protocol ?? 'nothing'}`);

            const foreign = requests.filter((request) => new URL(request.url).origin !== origin);
            check('same-origin', foreign.length ? `requests to other origins: ${foreign.map((request) => request.url).slice(0, 3).join(', ')}` : null);

            const styles = await page.evaluate(() => ({
                links: [...document.querySelectorAll('link[rel~="stylesheet"]')].map((link) => link.getAttribute('href')),
                inline: [...document.querySelectorAll('style')].reduce((sum, style) => sum + style.textContent.length, 0),
            }));
            const cssRequests = requests.filter((request) => categoryOf(request) === 'css').map((request) => new URL(request.url).pathname);
            const stylesheetProblem = styles.links.length !== 1 || styles.links[0] !== '/assets/app.css' ? `stylesheets linked: ${JSON.stringify(styles.links)}`
                : cssRequests.some((path) => path !== '/assets/app.css') ? `stylesheets fetched: ${JSON.stringify(cssRequests)}`
                    : styles.inline > INLINE_STYLE_LIMIT ? `${styles.inline} bytes of inline <style>, more than ${INLINE_STYLE_LIMIT}` : null;
            check('one-stylesheet', stylesheetProblem);

            const extras = await page.evaluate(async () => ({
                workers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
                speculation: document.querySelectorAll('script[type="speculationrules"], link[rel~="prerender"]').length,
            }));
            check('no-service-worker', extras.workers ? 'a service worker is registered' : null);
            check('no-prerendering', extras.speculation ? 'the page asks the browser to prerender' : null);

            const images = await page.evaluate(() => window.__bench.images());
            check('same-images', JSON.stringify(images) === JSON.stringify(golden.states.initial.images) ? null : `card images differ: ${JSON.stringify(images.find((image, i) => JSON.stringify(image) !== JSON.stringify(golden.states.initial.images[i])) ?? images.length)}`);
            check('no-errors', session.errors.length ? session.errors.slice(0, 3).join(' | ') : null);
        } finally {
            await session.close();
        }
    }

    // 3. Every journey reaches its result, and the page then reads as expected.
    for (const journey of JOURNEYS) {
        const session = await open({ browser, profile, throttle: false });
        try {
            const { page, cdp } = session;
            await page.goto(url, { waitUntil: 'load' });
            await settle(session);
            await perform(journey, { page, cdp, input: profile.input, searchMode: stack.manifest.search, settle: () => settle(session, { quietMs: 300 }) });
            let effect = null;
            for (let waited = 0; waited < 15_000 && !effect; waited += 100) {
                effect = await page.evaluate(() => (window.__bench ? window.__bench.effect : null)).catch(() => null);
                if (!effect) await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!effect) {
                check(`journey-${journey}`, `no result within 15 s (expected ${JSON.stringify(EXPECTED[journey].condition)})`);
                continue;
            }
            await settle(session);
            const problem = compareTexts(await page.evaluate(() => window.__bench.texts()), golden.states[journey]);
            check(`journey-${journey}`, problem ?? (session.errors.length ? `errors: ${session.errors.slice(0, 3).join(' | ')}` : null));
        } catch (error) {
            check(`journey-${journey}`, error.message);
        } finally {
            await session.close();
        }
    }

    return { passed: checks.every((item) => item.passed), checks };
}
