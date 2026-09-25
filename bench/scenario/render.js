/**
 * The reference render of the Wirestore page. The `static` app serves it
 * as is; `vanilla` and `cyclewire` add attributes and scripts through hooks.
 * Other stacks render the page with their own tools, and are checked against
 * the visible text this produces (golden.json).
 */
import { product, products } from './catalog.js';
import {
    CATEGORIES, EAGER_IMAGES, INVALID_EMAIL, card, cartSummary, esc, formatPrice, matches, quickView, resultText, thanks,
} from './markup.js';

/**
 * The page state, as the URL and the cart cookie describe it.
 * @typedef {object} State
 * @property {string} q search query
 * @property {string} category category id, or ''
 * @property {string} view product id shown in the quick view, or ''
 * @property {string} subscribed the email that just subscribed, or ''
 * @property {boolean} invalidEmail the newsletter form was sent an invalid address
 * @property {Record<string, number>} cart
 */

/**
 * @param {URL} url
 * @param {Record<string, number>} cart
 * @returns {State}
 */
export function stateFrom(url, cart) {
    const params = url.searchParams;
    const category = params.get('category') ?? '';
    const view = params.get('view') ?? '';
    return {
        q: params.get('q') ?? '',
        category: CATEGORIES.some((candidate) => candidate.id === category) ? category : '',
        view: product(view) ? view : '',
        subscribed: params.get('subscribed') ?? '',
        invalidEmail: params.get('newsletter') === 'invalid',
        cart,
    };
}

/**
 * @typedef {object} Hooks
 * @property {string} [head] markup appended to <head>
 * @property {string} [bodyEnd] markup appended to <body>
 * @property {import('./markup.js').Attrs} [attrs]
 */

/**
 * @param {State} state
 * @param {Hooks} [hooks]
 */
export function renderPage(state, { head = '', bodyEnd = '', attrs = {} } = {}) {
    const hook = (name, ...args) => attrs[name]?.(...args) ?? '';
    const { count, total } = cartSummary(state.cart, products);
    const visible = products.filter((candidate) => matches(candidate, state));
    const eager = new Set(visible.slice(0, EAGER_IMAGES).map((candidate) => candidate.id));
    const shown = new Set(visible.map((candidate) => candidate.id));
    const open = state.view ? product(state.view) : null;
    const status = state.subscribed ? thanks(state.subscribed) : state.invalidEmail ? INVALID_EMAIL : '';

    const categoryLinks = [{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => {
        const current = id === state.category ? ' aria-current="page"' : '';
        return `<a href="${id ? `/?category=${id}` : '/'}"${current}${hook('categoryLink', id)}>${esc(name)}</a>`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wirestore</title>
<link rel="stylesheet" href="/assets/app.css">
${head}
</head>
<body>
<header class="top">
<a class="brand" href="/">Wirestore</a>
<p class="cart">Cart <span id="cart-count"${hook('cartCount')}>${count}</span> · <span id="cart-total"${hook('cartTotal')}>${formatPrice(total)}</span></p>
</header>
<main>
<section class="intro">
<h1>Everyday objects, made well</h1>
<p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
</section>
<form class="search" role="search" action="/" method="get"${hook('searchForm')}>
<label for="q">Search products</label>
<div class="search__row"><input id="q" name="q" type="search" value="${esc(state.q)}" autocomplete="off"${hook('searchInput')}>${state.category ? `<input type="hidden" name="category" value="${esc(state.category)}">` : ''}<button>Search</button></div>
</form>
<nav class="categories" id="categories" aria-label="Categories">${categoryLinks}</nav>
<p class="count" id="result-count" role="status">${resultText(visible.length)}</p>
<ul class="grid" id="products">
${products.map((candidate) => card(candidate, { hidden: !shown.has(candidate.id), eager: eager.has(candidate.id), attrs })).join('\n')}
</ul>
<section class="newsletter" aria-labelledby="newsletter-title">
<h2 id="newsletter-title">Get the Wirestore letter</h2>
<p>New arrivals and restocks, once a month.</p>
<form id="newsletter" action="/newsletter" method="post"${hook('newsletter')}>
<label for="email">Email</label>
<div class="newsletter__row"><input id="email" name="email" type="email" required autocomplete="email"><button>Subscribe</button></div>
</form>
<p id="newsletter-status" role="status">${esc(status)}</p>
</section>
</main>
<dialog id="quick-view" aria-labelledby="quick-view-title"${open ? ' open' : ''}${hook('dialog')}>${open ? quickView(open, attrs) : ''}</dialog>
<footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
${bodyEnd}
</body>
</html>
`;
}
