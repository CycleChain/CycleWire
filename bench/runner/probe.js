/**
 * The in-page probe. It is installed with addInitScript, so it runs before
 * any of the page's own scripts in every document, and exposes
 * window.__bench to the runner.
 *
 * It records paint and layout metrics, long tasks and Event Timing entries,
 * the timestamp of every input, and answers one question for journeys: when
 * did the expected result first reach the screen? The runner arms a named
 * condition just before the input it measures; from that input on, the probe
 * checks the condition once per frame and, when it holds, records the time
 * right after that frame is painted. When the input navigates (a form post, a
 * link), the armed condition travels in sessionStorage and the next document
 * keeps watching, so a full page load counts as the effect too.
 *
 * Timestamps are milliseconds since the epoch (performance.timeOrigin plus a
 * high-resolution offset), so times from two documents can be compared.
 */
export function probe() {
    if (window.top !== window || window.__bench) return;
    const origin = performance.timeOrigin;
    const epoch = () => origin + performance.now();
    const PENDING = '__bench.pending';

    const bench = {
        fcp: null,
        lcp: null,
        lcpElement: null,
        cls: 0,
        /** @type {Array<[number, number]>} start, duration (ms since navigation) */
        longTasks: [],
        lastLongTaskEnd: 0,
        /** @type {Array<{ name: string, start: number, duration: number, interaction: number }>} */
        events: [],
        /** @type {Array<[string, number]>} type, epoch ms */
        inputs: [],
        /** @type {null | { name: string, arg: any, inputAt: number | null, navigated?: boolean }} */
        armed: null,
        /** @type {null | { at: number, inputAt: number, navigated: boolean }} */
        effect: null,
    };
    window.__bench = bench;

    const observe = (type, callback, options = {}) => {
        try {
            new PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...options });
        } catch {
            // Not supported by this browser: the metric stays null.
        }
    };

    observe('paint', (entry) => {
        if (entry.name === 'first-contentful-paint') bench.fcp = entry.startTime;
    });
    observe('largest-contentful-paint', (entry) => {
        bench.lcp = entry.startTime;
        const el = entry.element;
        bench.lcpElement = el ? `${el.localName}${el.id ? `#${el.id}` : ''}${el.closest?.('[data-product]') ? `[data-product=${el.closest('[data-product]').dataset.product}]` : ''}` : null;
    });
    // Cumulative Layout Shift: the largest session window, as web-vitals computes it.
    let session = 0;
    let first = 0;
    let last = 0;
    observe('layout-shift', (entry) => {
        if (entry.hadRecentInput) return;
        if (session && entry.startTime - last < 1000 && entry.startTime - first < 5000) session += entry.value;
        else {
            session = entry.value;
            first = entry.startTime;
        }
        last = entry.startTime;
        bench.cls = Math.max(bench.cls, session);
    });
    observe('longtask', (entry) => {
        bench.longTasks.push([entry.startTime, entry.duration]);
        bench.lastLongTaskEnd = Math.max(bench.lastLongTaskEnd, entry.startTime + entry.duration);
    });
    observe('event', (entry) => {
        if (entry.interactionId) bench.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration, interaction: entry.interactionId });
    }, { durationThreshold: 16 });

    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'keydown']) {
        addEventListener(type, (event) => {
            const at = origin + event.timeStamp;
            bench.inputs.push([type, at]);
            const armed = bench.armed;
            if (armed && armed.inputAt === null) {
                armed.inputAt = at;
                try {
                    sessionStorage.setItem(PENDING, JSON.stringify(armed));
                } catch {
                    // Storage is off: navigations will not be followed.
                }
            }
        }, { capture: true, passive: true });
    }

    const byId = (id) => document.getElementById(id);
    const text = (id) => byId(id)?.textContent?.trim() ?? null;
    const visible = (el) => (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
    const CONDITIONS = {
        /** The cart header shows this many items. */
        cart: (count) => text('cart-count') === String(count),
        /** Exactly these cards are visible, in this order, and the count says so. */
        results: ({ ids, count }) => {
            const list = byId('products');
            if (!list || text('result-count') !== count) return false;
            const shown = [...list.querySelectorAll('[data-product]')].filter(visible).map((el) => el.getAttribute('data-product'));
            return shown.length === ids.length && shown.every((id, i) => id === ids[i]);
        },
        /** The quick view is open on this product. */
        dialog: ({ title }) => {
            const dialog = byId('quick-view');
            return Boolean(dialog?.open) && visible(dialog) && dialog.querySelector('#quick-view-title')?.textContent?.trim() === title;
        },
        /** The newsletter status says this. */
        status: (message) => text('newsletter-status') === message,
    };

    /** Calls `callback` in the task after the next frame, which is after it painted. */
    const afterPaint = (callback) => requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = callback;
        channel.port2.postMessage(null);
    });

    function watch() {
        const armed = bench.armed;
        if (!armed || bench.effect) return;
        if (armed.inputAt !== null && CONDITIONS[armed.name]?.(armed.arg)) {
            // This frame paints the effect.
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
                bench.effect = { at: epoch(), inputAt: armed.inputAt, navigated: armed.navigated === true };
                try {
                    sessionStorage.removeItem(PENDING);
                } catch {
                    // Nothing to clean up.
                }
            };
            channel.port2.postMessage(null);
            return;
        }
        requestAnimationFrame(watch);
    }

    /** Arms a condition; the next input starts the clock. */
    bench.arm = (name, arg) => {
        if (!CONDITIONS[name]) throw new Error(`Unknown condition ${name}`);
        bench.armed = { name, arg, inputAt: null };
        bench.effect = null;
        requestAnimationFrame(watch);
    };
    bench.holds = (name, arg) => Boolean(CONDITIONS[name]?.(arg));
    bench.afterPaint = () => new Promise((resolve) => afterPaint(() => resolve(epoch())));

    // An input in the previous document navigated here: keep watching.
    try {
        const pending = sessionStorage.getItem(PENDING);
        if (pending) {
            bench.armed = { ...JSON.parse(pending), navigated: true };
            requestAnimationFrame(watch);
        }
    } catch {
        // Storage is off.
    }

    /** Load metrics so far, in ms since navigation start. */
    bench.snapshot = () => {
        const nav = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType('navigation')[0]);
        let lastResource = 0;
        for (const entry of performance.getEntriesByType('resource')) lastResource = Math.max(lastResource, /** @type {PerformanceResourceTiming} */ (entry).responseEnd);
        return {
            server: nav ? nav.responseStart - nav.requestStart : null,
            domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
            load: nav ? nav.loadEventEnd : null,
            fcp: bench.fcp,
            lcp: bench.lcp,
            lcpElement: bench.lcpElement,
            cls: bench.cls,
            longTasks: bench.longTasks.slice(),
            settled: Math.max(nav ? nav.loadEventEnd : 0, lastResource, bench.lastLongTaskEnd),
            now: performance.now(),
            origin,
        };
    };

    /** Whether the page is quiet: loaded, and no long task for `ms`. */
    bench.quiet = (ms) => document.readyState === 'complete' && performance.now() - bench.lastLongTaskEnd >= ms;

    /**
     * Visible text in document order: every text node whose element is
     * rendered and visible, outside <script>, <style>, <template> and the
     * excluded selector, with whitespace collapsed.
     */
    function textOf(root, exclude) {
        const parts = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const parent = node.parentElement;
            if (!parent || parent.closest('script, style, template, noscript')) continue;
            if (exclude && parent.closest(exclude)) continue;
            if (!visible(parent)) continue;
            const value = node.data.replace(/\s+/g, ' ').trim();
            if (value) parts.push(value);
        }
        return parts.join(' ');
    }
    bench.texts = () => {
        const dialog = byId('quick-view');
        return { page: textOf(document.body, 'dialog'), dialog: dialog && dialog.open ? textOf(dialog) : '' };
    };

    /** The image attributes of the visible product cards, for conformance. */
    bench.images = () => [...document.querySelectorAll('#products [data-product]')].filter(visible).map((card) => {
        const img = card.querySelector('img');
        return { product: card.getAttribute('data-product'), src: img?.getAttribute('src') ?? null, width: img?.getAttribute('width') ?? null, height: img?.getAttribute('height') ?? null, loading: img?.getAttribute('loading') ?? 'eager' };
    });
}

/** The probe as a script for addInitScript. */
export const PROBE = `(${probe})();`;
