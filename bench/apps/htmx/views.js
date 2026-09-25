// What the server renders: the reference page with htmx attributes, and the
// fragments htmx asks for. The full page is scenario/render.js with hx-*
// attributes added through its hooks; fragments reuse scenario/markup.js, so
// a card or a quick view swapped in is the same markup the full page has.
import { search } from '../../scenario/catalog.js';
import { CATEGORIES, EAGER_IMAGES, card, esc, formatPrice, quickView, resultText } from '../../scenario/markup.js';
import { renderPage } from '../../scenario/render.js';

/**
 * htmx's configuration, which it reads from a <meta> tag when it starts.
 * - historyRestoreAsHxRequest: false. The server answers HX-Request with
 *   fragments, so a request that restores history must not send it.
 * - reportValidityOfForms: true. An invalid field is reported and focused, as
 *   with a native submission, rather than silently not sent.
 */
const CONFIG = { historyRestoreAsHxRequest: false, reportValidityOfForms: true };

const categoryHref = (id) => (id ? `/?category=${id}` : '/');

/**
 * The hx-* attributes. Each hx-get or hx-post repeats the href or action next
 * to it, so every link and form works the same without JavaScript, through a
 * full page load.
 * @type {import('../../scenario/markup.js').Attrs}
 */
export const attrs = {
    // Active search, on the form: typing asks 200 ms after the last key, and
    // submitting asks at once (the delay pending from typing is dropped). The
    // form sends the query with the category in its hidden input, and only
    // the results are swapped, never the input being typed into. Search and
    // category requests both fill #products: the latest one replaces any
    // still in flight.
    searchForm: () => ' id="search" hx-get="/" hx-trigger="submit, input changed delay:200ms" hx-target="#products" hx-sync="#products:replace"',
    categoryLink: (id) => ` hx-get="${categoryHref(id)}" hx-target="#products" hx-sync="#products:replace"`,
    // The answer holds only partials for the cart header, so the form stays as it is.
    addToCart: () => ' hx-post="/cart"',
    quickView: (product) => ` hx-get="/?view=${esc(product.id)}" hx-target="#quick-view"`,
    newsletter: () => ' hx-post="/newsletter" hx-target="#newsletter-status"',
    // Opens the dialog as a modal once the product has been swapped into it.
    // It can be open already: the swap of the add-to-cart form inside it
    // bubbles up here too, and a page loaded with ?view= renders it open but
    // not modal, where showModal() would throw.
    dialog: () => ' hx-on::after-swap="if (!this.open) this.showModal()"',
};

/**
 * The full page. htmx loads with a plain <script> in <head>, as its
 * installation guide describes.
 * @param {import('../../scenario/render.js').State} state
 * @param {string} script the URL htmx is served at
 */
export const page = (state, script) => renderPage(state, {
    head: `<meta name="htmx-config" content='${JSON.stringify(CONFIG)}'>\n<script src="${script}"></script>`,
    attrs,
});

/**
 * A swap command for another part of the page: htmx puts the content into the
 * target's innerHTML (so #result-count, a live region, stays the same
 * element) and drops the <hx-partial> tag itself.
 */
const partial = (target, content) => `<hx-partial hx-target="${target}">${content}</hx-partial>`;

/**
 * For a search or a category: the cards that match, for #products, and the
 * count. The first cards load their image eagerly, as on the full page.
 * @param {{ q: string, category: string }} state
 */
export function results({ q, category }) {
    const found = search({ q, category });
    return found.map((product, i) => card(product, { eager: i < EAGER_IMAGES, attrs })).join('\n')
        + partial('#result-count', resultText(found.length));
}

/**
 * For a category link, which also clears the search: the search form's fields
 * (an empty query, the category in the hidden input) and the category links
 * (the chosen one current). The links come last: they replace the link that
 * was clicked, and htmx finds each partial's target from that link.
 * @param {{ q: string, category: string }} state
 */
export function controls({ q, category }) {
    const hidden = category ? `<input type="hidden" name="category" value="${esc(category)}">` : '';
    const fields = `\n<label for="q">Search products</label>\n<div class="search__row"><input id="q" name="q" type="search" value="${esc(q)}" autocomplete="off">${hidden}<button>Search</button></div>\n`;
    const links = [{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => {
        const current = id === category ? ' aria-current="page"' : '';
        return `<a href="${categoryHref(id)}"${current}${attrs.categoryLink(id)}>${esc(name)}</a>`;
    }).join('');
    return partial('#search', fields) + partial('#categories', links);
}

/** What goes into the quick view dialog. */
export const details = (product) => quickView(product, attrs);

/**
 * After adding to the cart: the header's count and total. The answer has
 * nothing else, so htmx leaves the form that asked unchanged.
 * @param {{ count: number, total: number }} cart
 */
export const cartHeader = ({ count, total }) => partial('#cart-count', String(count)) + partial('#cart-total', formatPrice(total));
