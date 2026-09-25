// The reference page with CycleWire, set up the way its documentation
// recommends: the core as a module in <head>, actions in their own chunks,
// the cart header bound to a store the server serializes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summary } from '../../scenario/catalog.js';
import { listen } from '../../scenario/server.js';

const manifest = JSON.parse(readFileSync(new URL('dist/js/.vite/manifest.json', import.meta.url), 'utf8'));
const entry = manifest['src/main.js'];
const preloads = [entry.file, ...(entry.imports ?? []).map((key) => manifest[key].file)];
const head = [
    ...preloads.map((file) => `<link rel="modulepreload" href="/js/${file}">`),
    `<script type="module" src="/js/${entry.file}"></script>`,
].join('\n');
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

listen({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    hooks: (state) => ({
        head,
        bodyEnd: `<script type="application/json" data-cw-store="cart">${json(summary(state.cart))}</script>`,
        attrs: {
            cartCount: () => ' data-cw-bind="text: $cart.count"',
            cartTotal: () => ' data-cw-bind="text: $cart.totalText"',
            searchForm: () => ' data-cw-action="catalog#search" data-cw-on-input="catalog#search"',
            categoryLink: () => ' data-cw-action="catalog#category" data-cw-prevent="click"',
            addToCart: () => ' data-cw-action="cart#add" data-cw-preload="idle"',
            quickView: () => ' data-cw-action="quickview" data-cw-prevent="click"',
            newsletter: () => ' data-cw-action="newsletter"',
        },
    }),
});
