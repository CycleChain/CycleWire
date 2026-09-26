// What the server renders: the reference page with cyclewire/request's
// attributes, and the fragments those requests ask for. The full page is
// scenario/render.js with cw-* attributes added through its hooks; fragments
// reuse scenario/markup.js, so a card or a quick view swapped in is the same
// markup the full page has.
import { search } from '../../scenario/catalog.js';
import { CATEGORIES, EAGER_IMAGES, card, esc, formatPrice, quickView, resultText } from '../../scenario/markup.js';
import { renderPage } from '../../scenario/render.js';

const categoryHref = (id) => (id ? `/?category=${id}` : '/');

/**
 * The cw-* attributes. A link requests its href and a form its action, so
 * every one of them works the same without JavaScript, through a full page
 * load.
 * @type {import('../../scenario/markup.js').Attrs}
 */
export const attrs = {
    // Search as you type, on the form, so the query goes with the category in
    // its hidden input: a request 200 ms after the last key or a submit (the
    // debounce is the form's). Input runs in restart mode, so each new key
    // aborts the request before it. Only the results are swapped, never the
    // input being typed into.
    searchForm: () => ' id="search" cw-action="request" cw-on-input="request" cw-debounce="200" cw-target="#products"',
    categoryLink: () => ' cw-action="request" cw-prevent cw-target="#products"',
    // The answer is the header's cart summary, with the new count and total.
    addToCart: () => ' cw-action="request" cw-target=".cart"',
    // An empty cw-prefetch fetches the link's own URL on intent, and the
    // request takes that response. ./src/actions/quickview.js opens the dialog.
    quickView: () => ' cw-action="quickview" cw-prevent cw-prefetch cw-target="#quick-view"',
    newsletter: () => ' cw-action="request" cw-target="#newsletter-status"',
};

/**
 * The full page.
 * @param {import('../../scenario/render.js').State} state
 * @param {string} head the script and module preloads
 */
export const page = (state, head) => renderPage(state, { head, attrs });

/**
 * A message that changes another part of the page: cyclewire/request applies
 * the <cw-stream> messages at the top level of an answer to the elements
 * they name, and puts the rest into its target.
 */
const stream = (op, target, content) => `<cw-stream op="${op}" target="${target}"><template>${content}</template></cw-stream>`;

/**
 * For a search or a category: the cards that match, for #products, and the
 * count, into #result-count, a live region that stays the same element. The
 * first cards load their image eagerly, as on the full page.
 * @param {{ q: string, category: string }} state
 */
export function results({ q, category }) {
    const found = search({ q, category });
    return found.map((product, i) => card(product, { eager: i < EAGER_IMAGES, attrs })).join('\n')
        + stream('inner', 'result-count', resultText(found.length));
}

/**
 * For a category link, which also clears the search: the search form's fields
 * (an empty query, the category in the hidden input), replaced, and the
 * category links (the chosen one current), morphed, so the link that was
 * tapped stays and keeps focus.
 * @param {{ q: string, category: string }} state
 */
export function controls({ q, category }) {
    const hidden = category ? `<input type="hidden" name="category" value="${esc(category)}">` : '';
    const fields = `\n<label for="q">Search products</label>\n<div class="search__row"><input id="q" name="q" type="search" value="${esc(q)}" autocomplete="off">${hidden}<button>Search</button></div>\n`;
    const links = [{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => {
        const current = id === category ? ' aria-current="page"' : '';
        return `<a href="${categoryHref(id)}"${current}${attrs.categoryLink(id)}>${esc(name)}</a>`;
    }).join('');
    return stream('inner', 'search', fields) + stream('morph', 'categories', links);
}

/** What goes into the quick view dialog. */
export const details = (product) => quickView(product, attrs);

/**
 * After adding to the cart: what goes into the header's <p class="cart">.
 * @param {{ count: number, total: number }} cart
 */
export const cartSummary = ({ count, total }) => `Cart <span id="cart-count">${count}</span> · <span id="cart-total">${formatPrice(total)}</span>`;
