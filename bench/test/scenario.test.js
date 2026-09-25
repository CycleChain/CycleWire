import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add, cartCookie, readCart } from '../scenario/cart.js';
import { products, search } from '../scenario/catalog.js';
import { CATEGORIES, EAGER_IMAGES, esc, formatPrice, matches, resultText } from '../scenario/markup.js';
import { renderPage, stateFrom } from '../scenario/render.js';
import { generate } from '../scripts/products.js';

const state = (overrides = {}) => ({ q: '', category: '', view: '', subscribed: '', invalidEmail: false, cart: {}, ...overrides });

test('the committed catalog is what the generator produces', () => {
    assert.deepEqual(products, generate());
});

test('50 products, unique ids in page order, every category present', () => {
    assert.equal(products.length, 50);
    assert.deepEqual(products.map((product) => product.id), Array.from({ length: 50 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`));
    assert.equal(new Set(products.map((product) => product.name)).size, 50);
    for (const { id } of CATEGORIES) assert.ok(products.filter((product) => product.category === id).length >= 7, id);
    for (const product of products) assert.ok(product.price > 0 && product.price % 50 === 0, product.id);
});

test('the search query changes the results with its last letter', () => {
    // The search journey times the last keystroke, so the prefix must match something else.
    assert.notDeepEqual(search({ q: 'lam' }), search({ q: 'lamp' }));
    assert.equal(search({ q: 'lamp' }).length, 4);
    assert.equal(search({ q: '  LAMP ' }).length, 4);
});

test('filters combine a query and a category', () => {
    assert.ok(matches({ name: 'Walnut Desk Lamp', category: 'lighting' }, { q: 'desk', category: 'lighting' }));
    assert.ok(!matches({ name: 'Walnut Desk Lamp', category: 'lighting' }, { q: 'desk', category: 'garden' }));
    assert.equal(resultText(0), 'No products found');
    assert.equal(resultText(1), '1 product');
    assert.equal(resultText(8), '8 products');
    assert.equal(formatPrice(4550), '$45.50');
});

test('the cart cookie keeps known products and whole quantities only', () => {
    const cookie = `other=1; cart=${encodeURIComponent(JSON.stringify({ p01: 2, nope: 1, p02: 1.5, p03: -1, p04: 500 }))}`;
    assert.deepEqual(readCart(cookie), { p01: 2, p04: 99 });
    assert.deepEqual(readCart('cart=%7Bbroken'), {});
    assert.deepEqual(readCart(undefined), {});
    assert.equal(add({}, 'nope'), null);
    const next = add({ p01: 1 }, 'p01');
    assert.deepEqual(next, { p01: 2 });
    assert.deepEqual(readCart(cartCookie(next).split(';')[0]), next);
});

test('the page escapes what it echoes', () => {
    const html = renderPage(state({ q: '"><script>alert(1)</script>', subscribed: '<b>@x.y' }));
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
    assert.ok(html.includes('&lt;b&gt;@x.y'));
    assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('every card is rendered; filtered ones are hidden and only the first visible ones load eagerly', () => {
    const html = renderPage(state({ category: 'lighting' }));
    assert.equal((html.match(/data-product="/g) ?? []).length, 50);
    const visible = [...html.matchAll(/<li class="card" data-product="(p\d\d)" data-category="(\w+)">/g)];
    assert.ok(visible.every(([, , category]) => category === 'lighting'));
    assert.equal(visible.length, 8);
    assert.equal((html.match(/loading="eager"/g) ?? []).length, EAGER_IMAGES);
    assert.ok(html.includes('<p class="count" id="result-count" role="status">8 products</p>'));
});

test('state comes from the URL, and unknown values are ignored', () => {
    const parsed = stateFrom(new URL('https://x/?q=lamp&category=nope&view=p99&subscribed=a%40b.c'), {});
    assert.deepEqual(parsed, { q: 'lamp', category: '', view: '', subscribed: 'a@b.c', invalidEmail: false, cart: {} });
    assert.ok(renderPage(stateFrom(new URL('https://x/?view=p04'), {})).includes('<dialog id="quick-view" aria-labelledby="quick-view-title" open>'));
});

test('hooks add attributes without changing the text', () => {
    const strip = (html) => html.replace(/<[^>]*>/g, '');
    const plain = renderPage(state());
    const hooked = renderPage(state(), {
        head: '<script type="module" src="/js/app.js"></script>',
        attrs: { addToCart: () => ' data-x="1"', quickView: () => ' data-y', categoryLink: (id) => ` data-c="${id}"` },
    });
    assert.ok(hooked.includes('<form method="post" action="/cart" data-x="1">'));
    assert.ok(hooked.includes('<a href="/?category=garden" data-c="garden">Garden</a>'));
    assert.equal(strip(hooked), strip(plain));
});
