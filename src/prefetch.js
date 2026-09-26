/**
 * cyclewire/prefetch — data fetched on intent, alongside the action's code.
 *
 *   <a href="/products/42" cw-action="quickview" cw-prefetch="/api/products/42">Quick view</a>
 *
 *   start({ actions, plugins: [prefetch()] });
 *
 *   export async function run({ fetch, signal }) {
 *       const product = await (await fetch('/api/products/42', { signal })).json();
 *   }
 *
 * When the pointer or focus reaches the element, a GET of `cw-prefetch`
 * starts next to the action's module, and the handler's `ctx.fetch()` of the
 * same URL takes that response instead of asking again. The code and the data
 * then arrive together, not one after the other.
 */
import { trace } from './util.js';

/** How long a prefetched response waits for its action, in ms. */
const FRESH = 10000;
/** @type {Map<string, { response: Promise<Response>, at: number }>} */
const fetched = new Map();

/**
 * Starts fetching a URL, unless it was fetched a moment ago. Only the page's
 * own origin: markup never makes the browser ask another site for anything.
 * @param {string} url
 */
function start(url) {
    const href = new URL(url, document.baseURI);
    const found = fetched.get(href.href);
    if (href.origin !== location.origin || (found && Date.now() - found.at < FRESH)) return;
    const response = fetch(href);
    // A failure surfaces when the action asks, and it then fetches again.
    response.catch(() => {});
    fetched.set(href.href, { response, at: Date.now() });
    // Keep a handful: the pointer can cross many elements.
    if (fetched.size > 16) fetched.delete(/** @type {string} */ (fetched.keys().next().value));
    if (__DEV__) trace({ type: 'prefetch', url: href.href });
}

/**
 * `fetch()`, except that a plain GET of a URL intent fetched in the last ten
 * seconds takes that response, once. A request with a method, headers, a
 * body or any option but `signal` asks for something else and goes out as
 * it is.
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function fetchAhead(input, init) {
    const key = typeof input === 'string' || input instanceof URL ? new URL(input, document.baseURI).href : '';
    const found = fetched.get(key);
    if (!found || Date.now() - found.at >= FRESH || (init && Object.keys(init).some((option) => option !== 'signal'))) return fetch(input, init);
    fetched.delete(key);
    const response = found.response.catch(() => fetch(input, init));
    const signal = init?.signal;
    if (!signal) return response;
    return new Promise((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        response.then(resolve, reject);
    });
}

/**
 * The plugin: prefetches an element's `cw-prefetch` on intent, unless the
 * element opts out of preloading (`cw-preload="none"`), and gives every
 * handler `ctx.fetch`.
 * @returns {import('./index.js').Plugin}
 */
export function prefetch() {
    let attr = 'cw-prefetch';
    return {
        setup({ prefix }) {
            attr = `${prefix || 'data-'}prefetch`;
        },
        intent(element) {
            const url = element.getAttribute(attr);
            if (url) start(url);
        },
        context(ctx) {
            ctx.fetch = fetchAhead;
        },
    };
}
