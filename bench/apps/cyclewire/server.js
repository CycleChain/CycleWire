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
        bodyEnd: `<script type="application/json" cw-store="cart">${json(summary(state.cart))}</script>`,
        attrs: {
            cartCount: () => ' cw-bind="text: $cart.count"',
            cartTotal: () => ' cw-bind="text: $cart.totalText"',
            searchForm: () => ' cw-action="catalog#search" cw-on-input="catalog#search"',
            categoryLink: () => ' cw-action="catalog#category" cw-prevent="click"',
            addToCart: () => ' cw-action="cart#add" cw-preload="idle"',
            quickView: () => ' cw-action="quickview" cw-prevent="click"',
            newsletter: () => ' cw-action="newsletter"',
        },
    }),
});
