// What the server renders for Hotwire: the reference page (scenario/render.js
// and scenario/markup.js) with two Turbo Frames and the attributes Turbo and
// Stimulus read, the frames on their own, and the Turbo Stream messages that
// answer form submissions. Frames and streams are made of the page's own
// markup, so what Turbo puts into the page is what a full page load renders.
//
// The reference render has attribute hooks but no way to wrap part of the
// page in an element, and a frame is a <turbo-frame> around its content, so
// the page is this module's own copy of the reference template. It adds
// nothing that is read: the text, the ids and the images are the reference's.
import { product, products, summary } from '../../scenario/catalog.js';
import {
    CATEGORIES, EAGER_IMAGES, INVALID_EMAIL, card, esc, formatPrice, matches, quickView, resultText, thanks,
} from '../../scenario/markup.js';

/** The frame around the result count and the cards, which the search form targets. */
const RESULTS = 'results';
/** The frame inside the quick view dialog, which the Quick view links target. */
const QUICK_VIEW = 'quick-view-content';

/**
 * Attributes on the reference markup that the page shares with its frames.
 * @type {import('../../scenario/markup.js').Attrs}
 */
const attrs = {
    // Turbo loads the product into the frame inside the dialog, and the
    // quick-view controller opens the dialog once it has loaded.
    quickView: () => ` data-turbo-frame="${QUICK_VIEW}"`,
};

/**
 * A frame is only navigated by what names it: the search form or a Quick
 * view link. Its target is _top, so the add-to-cart forms inside it submit
 * for the page, as the page's other forms do, rather than for the frame.
 */
const frame = (id, content) => `<turbo-frame id="${id}" target="_top">${content}</turbo-frame>`;

/**
 * The result count and every card, those that do not match hidden, as in the
 * reference. The first cards shown load their image eagerly.
 * @param {import('../../scenario/render.js').State} state
 */
function results(state) {
    const visible = products.filter((candidate) => matches(candidate, state));
    const shown = new Set(visible.map((candidate) => candidate.id));
    const eager = new Set(visible.slice(0, EAGER_IMAGES).map((candidate) => candidate.id));
    return `<p class="count" id="result-count" role="status">${resultText(visible.length)}</p>
<ul class="grid" id="products">
${products.map((candidate) => card(candidate, { hidden: !shown.has(candidate.id), eager: eager.has(candidate.id), attrs })).join('\n')}
</ul>`;
}

/** @param {import('../../scenario/render.js').State} state */
const resultsFrame = (state) => frame(RESULTS, results(state));

/** @param {import('../../scenario/render.js').State} state */
const quickViewFrame = (state) => frame(QUICK_VIEW, state.view ? quickView(product(state.view), attrs) : '');

/**
 * The frames by id. A request that carries the Turbo-Frame header gets only
 * the frame it names, rendered for the same state as the full page.
 */
export const FRAMES = new Map([[RESULTS, resultsFrame], [QUICK_VIEW, quickViewFrame]]);

/**
 * The full page.
 * - The script loads with defer in <head>, fingerprinted and tracked, so a
 *   new bundle makes Turbo Drive reload the page.
 * - The cart's count and total are permanent: Turbo Streams update them in
 *   place, and a page Turbo restores from its cache keeps the current cart.
 * - The search form targets the results frame, and the search controller
 *   submits it as you type. Category links are plain Turbo Drive visits.
 * - The dialog holds the quick view's frame, and its controller opens it
 *   when a product has loaded into the frame.
 * @param {import('../../scenario/render.js').State} state
 * @param {string} script the URL of the bundle
 */
export function page(state, script) {
    const { count, total } = summary(state.cart);
    const status = state.subscribed ? thanks(state.subscribed) : state.invalidEmail ? INVALID_EMAIL : '';
    const categoryLinks = [{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => {
        const current = id === state.category ? ' aria-current="page"' : '';
        return `<a href="${id ? `/?category=${id}` : '/'}"${current}>${esc(name)}</a>`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wirestore</title>
<link rel="stylesheet" href="/assets/app.css">
<script src="${esc(script)}" defer data-turbo-track="reload"></script>
</head>
<body>
<header class="top">
<a class="brand" href="/">Wirestore</a>
<p class="cart">Cart <span id="cart-count" data-turbo-permanent>${count}</span> · <span id="cart-total" data-turbo-permanent>${formatPrice(total)}</span></p>
</header>
<main>
<section class="intro">
<h1>Everyday objects, made well</h1>
<p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
</section>
<form class="search" role="search" action="/" method="get" data-turbo-frame="${RESULTS}" data-controller="search" data-action="input->search#queue submit->search#cancel">
<label for="q">Search products</label>
<div class="search__row"><input id="q" name="q" type="search" value="${esc(state.q)}" autocomplete="off">${state.category ? `<input type="hidden" name="category" value="${esc(state.category)}">` : ''}<button>Search</button></div>
</form>
<nav class="categories" id="categories" aria-label="Categories">${categoryLinks}</nav>
${resultsFrame(state)}
<section class="newsletter" aria-labelledby="newsletter-title">
<h2 id="newsletter-title">Get the Wirestore letter</h2>
<p>New arrivals and restocks, once a month.</p>
<form id="newsletter" action="/newsletter" method="post">
<label for="email">Email</label>
<div class="newsletter__row"><input id="email" name="email" type="email" required autocomplete="email"><button>Subscribe</button></div>
</form>
<p id="newsletter-status" role="status">${esc(status)}</p>
</section>
</main>
<dialog id="quick-view" aria-labelledby="quick-view-title"${state.view ? ' open' : ''} data-controller="quick-view" data-action="turbo:frame-load->quick-view#open">${quickViewFrame(state)}</dialog>
<footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
</body>
</html>
`;
}

/** A Turbo Stream action whose template replaces the target's contents. */
const update = (target, content) => `<turbo-stream action="update" target="${target}"><template>${content}</template></turbo-stream>`;

/**
 * After adding to the cart: the header's count and total.
 * @param {{ count: number, total: number }} cart
 */
export const cartStream = ({ count, total }) => update('cart-count', String(count)) + update('cart-total', formatPrice(total));

/** After the newsletter form: the server's message. */
export const newsletterStream = (message) => update('newsletter-status', esc(message));
