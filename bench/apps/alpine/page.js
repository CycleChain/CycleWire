/**
 * The Wirestore page as an Alpine.js page: the reference markup
 * (scenario/render.js and scenario/markup.js), with Alpine's directives
 * written into it the way a server template for Alpine carries them. People
 * read the same text in every state, with or without JavaScript.
 *
 * It departs from the reference markup in two places, neither of them
 * visible: cards the server filters out are hidden with `display: none`
 * rather than the `hidden` attribute, because that is what `x-show` toggles;
 * and the quick view dialog always contains its elements, filled in by the
 * server when the page opens on a product (?view=) and bound with `x-text`
 * for the products opened later.
 */
import { detail, product, products, summary } from '../../scenario/catalog.js';
import {
    CATEGORIES, EAGER_IMAGES, INVALID_EMAIL, categoryName, esc, formatPrice, matches, resultText, thanks,
} from '../../scenario/markup.js';

/** A value as a JavaScript expression (JSON) inside a double-quoted attribute. */
const js = (value) => esc(JSON.stringify(value));

/** A value as the content of a <script type="application/json">. */
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * @param {object} item a product
 * @param {{ shown: boolean, eager: boolean }} options
 */
function card(item, { shown, eager }) {
    const id = js(item.id);
    return `<li class="card" data-product="${esc(item.id)}" data-category="${esc(item.category)}"${shown ? '' : ' style="display: none"'} x-show="$store.filters.shows(${id})">`
        + `<img src="/images/${esc(item.id)}.webp" alt="" width="480" height="360" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
        + `<h3>${esc(item.name)}</h3>`
        + `<p class="meta"><span>${esc(categoryName(item.category))}</span> <span class="price">${formatPrice(item.price)}</span></p>`
        + '<div class="actions">'
        + `<form method="post" action="/cart" @submit.prevent="$store.cart.add(${id})"><input type="hidden" name="id" value="${esc(item.id)}"><button>Add to cart</button></form>`
        + `<a class="quick" href="/?view=${esc(item.id)}" @click.prevent="$dispatch('quick-view', { id: ${id} })">Quick view</a>`
        + '</div></li>';
}

/**
 * The dialog's contents, bound to the quickView component.
 * @param {object | null} open the product the page opens on, or null
 */
function quickView(open) {
    return '<div class="quick-view">'
        + `<img${open ? ` src="/images/${esc(open.id)}.webp"` : ''} :src="image" alt="" width="480" height="360">`
        + '<div class="quick-view__body">'
        + `<h2 id="quick-view-title" x-text="name">${open ? esc(open.name) : ''}</h2>`
        + `<p class="meta"><span x-text="category">${open ? esc(categoryName(open.category)) : ''}</span> <span class="price" x-text="price">${open ? formatPrice(open.price) : ''}</span></p>`
        + `<p x-text="description">${open ? esc(open.description) : ''}</p>`
        + '<div class="actions">'
        + `<form method="post" action="/cart" @submit.prevent="$store.cart.add(product.id)"><input type="hidden" name="id" value="${open ? esc(open.id) : ''}" :value="product?.id"><button>Add to cart</button></form>`
        + '<form method="dialog"><button>Close</button></form>'
        + '</div></div></div>';
}

/**
 * @param {import('../../scenario/render.js').State} state
 * @param {{ head?: string }} [options] markup for <head>: the page's script
 */
export function renderPage(state, { head = '' } = {}) {
    const { count, total } = summary(state.cart);
    const shown = new Set(products.filter((candidate) => matches(candidate, state)).map((candidate) => candidate.id));
    const eager = new Set([...shown].slice(0, EAGER_IMAGES));
    const open = state.view ? product(state.view) : null;
    const status = state.subscribed ? thanks(state.subscribed) : state.invalidEmail ? INVALID_EMAIL : '';
    // What the stores start from (src/main.js). The query is not here: the
    // search box fills it in (x-model.fill).
    const initial = {
        cart: { count, total },
        filters: { category: state.category, products: products.map(({ id, name, category }) => ({ id, name, category })) },
    };

    const categoryLinks = [{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => {
        const current = id === state.category ? ' aria-current="page"' : '';
        return `<a href="${id ? `/?category=${id}` : '/'}"${current} :aria-current="$store.filters.current(${js(id)})" @click.prevent="$store.filters.choose(${js(id)})">${esc(name)}</a>`;
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
<p class="cart" x-data>Cart <span id="cart-count" x-text="$store.cart.count">${count}</span> · <span id="cart-total" x-text="$store.cart.totalText">${formatPrice(total)}</span></p>
</header>
<main>
<section class="intro">
<h1>Everyday objects, made well</h1>
<p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
</section>
<form class="search" role="search" action="/" method="get" x-data @submit.prevent>
<label for="q">Search products</label>
<div class="search__row"><input id="q" name="q" type="search" value="${esc(state.q)}" autocomplete="off" x-model.fill="$store.filters.q">${state.category ? `<input type="hidden" name="category" value="${esc(state.category)}">` : ''}<button>Search</button></div>
</form>
<nav class="categories" id="categories" aria-label="Categories" x-data>${categoryLinks}</nav>
<p class="count" id="result-count" role="status" x-data x-text="$store.filters.resultText">${resultText(shown.size)}</p>
<ul class="grid" id="products" x-data>
${products.map((item) => card(item, { shown: shown.has(item.id), eager: eager.has(item.id) })).join('\n')}
</ul>
<section class="newsletter" aria-labelledby="newsletter-title" x-data="newsletter(${js(status)})">
<h2 id="newsletter-title">Get the Wirestore letter</h2>
<p>New arrivals and restocks, once a month.</p>
<form id="newsletter" action="/newsletter" method="post" @submit.prevent="subscribe">
<label for="email">Email</label>
<div class="newsletter__row"><input id="email" name="email" type="email" required autocomplete="email" x-ref="email"><button>Subscribe</button></div>
</form>
<p id="newsletter-status" role="status" x-text="status">${esc(status)}</p>
</section>
</main>
<dialog id="quick-view" aria-labelledby="quick-view-title"${open ? ' open' : ''} x-data="quickView(${js(open ? detail(open) : null)})" @quick-view.window="show($event.detail.id)">${quickView(open)}</dialog>
<footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
<script type="application/json" id="initial-state">${json(initial)}</script>
</body>
</html>
`;
}
