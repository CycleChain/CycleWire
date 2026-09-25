/**
 * The five interactions every stack is measured on. Each starts from a page
 * that has finished loading, gives one input the way a person would, and
 * waits for the expected result to reach the screen (see probe.js). The
 * expected results are computed from the catalog, so they are the same for
 * every stack.
 */
import { products, search } from '../scenario/catalog.js';
import { resultText, thanks } from '../scenario/markup.js';
import { press, sleep, type } from './input.js';

export const JOURNEYS = ['cart', 'filter', 'search', 'quickview', 'newsletter'];

const CART_PRODUCT = 'p02';
const QUICK_VIEW_PRODUCT = 'p04';
const CATEGORY = { id: 'lighting', name: 'Lighting' };
const QUERY = 'lamp';
const EMAIL = 'reader@example.com';
/** Milliseconds between keys: a quick typist on a phone. */
const TYPING_DELAY = 120;

const results = (filters) => {
    const found = search(filters);
    return { ids: found.map((product) => product.id), count: resultText(found.length) };
};

/**
 * What each journey expects, and the page state that shows it without
 * JavaScript (for golden.json).
 */
export const EXPECTED = {
    cart: { condition: ['cart', 1], state: { url: '/', cart: { [CART_PRODUCT]: 1 } } },
    filter: { condition: ['results', results({ category: CATEGORY.id })], state: { url: `/?category=${CATEGORY.id}` } },
    search: { condition: ['results', results({ q: QUERY })], state: { url: `/?q=${QUERY}` } },
    quickview: {
        condition: ['dialog', { title: products.find((product) => product.id === QUICK_VIEW_PRODUCT)?.name }],
        state: { url: `/?view=${QUICK_VIEW_PRODUCT}` },
    },
    newsletter: { condition: ['status', thanks(EMAIL)], state: { url: `/?subscribed=${encodeURIComponent(EMAIL)}` } },
};

/**
 * Finds an element by selector and exact visible text, scrolls it to the
 * middle of the viewport if it is outside, and returns its centre.
 * @param {import('playwright').Page} page
 */
export async function locate(page, scope, text, { scroll = true } = {}) {
    return page.evaluate(({ scope, text, scroll }) => {
        const root = document.querySelector(scope);
        if (!root) return null;
        const candidates = text === null ? [root] : [...root.querySelectorAll('a, button, input, [role="button"]')].filter((el) => el.textContent.trim() === text || el.getAttribute('value') === text);
        const el = candidates.find((candidate) => candidate.getClientRects().length > 0);
        if (!el) return null;
        let rect = el.getBoundingClientRect();
        if (scroll && (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth)) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            rect = el.getBoundingClientRect();
        }
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { scope, text, scroll });
}

const TARGETS = {
    cart: [`[data-product="${CART_PRODUCT}"]`, 'Add to cart'],
    filter: ['#categories', CATEGORY.name],
    quickview: [`[data-product="${QUICK_VIEW_PRODUCT}"]`, 'Quick view'],
};

/**
 * Runs one journey on a page that has settled. Resolves when the input has
 * been given; the caller waits for the effect.
 * @param {string} id
 * @param {object} context
 * @param {import('playwright').Page} context.page
 * @param {import('playwright').CDPSession} context.cdp
 * @param {{ kind: 'touch' | 'mouse', holdMs: number, hoverMs: number }} context.input
 * @param {'live' | 'submit'} context.searchMode
 * @param {() => Promise<unknown>} context.settle waits until the page is quiet
 * @param {() => void} [context.onArm] called once the clock is armed, before the measured input
 */
export async function perform(id, { page, cdp, input, searchMode, settle, onArm = () => {} }) {
    const arm = async () => {
        await page.evaluate(([name, arg]) => window.__bench.arm(name, arg), EXPECTED[id].condition);
        onArm();
    };
    const target = async (scope, text) => {
        const point = await locate(page, scope, text);
        if (!point) throw new Error(`${id}: cannot find ${text ?? scope}`);
        return point;
    };

    if (id in TARGETS) {
        await target(...TARGETS[id]);
        await settle(); // anything the scroll started loading (lazy images)
        const point = await target(...TARGETS[id]);
        await arm();
        await press(page, cdp, input, point);
        return;
    }
    if (id === 'search') {
        await press(page, cdp, input, await target('#q', null));
        await sleep(300); // the keyboard comes up
        await type(page, QUERY.slice(0, -1), TYPING_DELAY);
        await arm();
        await page.keyboard.press(QUERY.slice(-1));
        if (searchMode === 'submit') {
            await sleep(TYPING_DELAY);
            await page.keyboard.press('Enter');
        }
        return;
    }
    if (id === 'newsletter') {
        await target('#newsletter', 'Subscribe');
        await settle();
        await press(page, cdp, input, await target('#email', null));
        await sleep(300);
        await type(page, EMAIL, 40);
        const point = await target('#newsletter', 'Subscribe');
        await arm();
        await press(page, cdp, input, point);
        return;
    }
    throw new Error(`Unknown journey ${id}`);
}

/** The early tap: add to cart as soon as the button is on screen. */
export const EARLY = { scope: TARGETS.cart[0], text: TARGETS.cart[1], condition: EXPECTED.cart.condition };
