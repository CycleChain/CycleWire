// What the CycleWire app and its variants (apps/cyclewire--*) share: the
// attributes that wire the reference page to the actions in src/actions/,
// and Vite's manifest. They differ only in what they put in <head>.
import { readFileSync } from 'node:fs';
import { listen } from '../../scenario/server.js';

/**
 * Reads a Vite manifest. `chunks(key)` is a chunk's file and the files of the
 * chunks it imports, for <link rel="modulepreload">.
 * @param {URL} url
 */
export function manifestOf(url) {
    const manifest = JSON.parse(readFileSync(url, 'utf8'));
    /** @param {string} key @returns {string[]} */
    const chunks = (key) => [manifest[key].file, ...(manifest[key].imports ?? []).flatMap(chunks)];
    return { manifest, chunks };
}

/**
 * Serves the page, with `head` in its <head> and the files in `js` under /js/.
 * @param {{ js: string, head: string }} options
 */
export function serve({ js, head }) {
    return listen({
        js,
        hooks: () => ({
            head,
            attrs: {
                searchForm: () => ' cw-action="catalog#search" cw-on-input="catalog#search"',
                categoryLink: () => ' cw-action="catalog#category" cw-prevent="click"',
                addToCart: () => ' cw-action="cart#add"',
                quickView: (product) => ` cw-action="quickview" cw-prevent="click" cw-prefetch="/api/products/${product.id}"`,
                newsletter: () => ' cw-action="newsletter"',
            },
        }),
    });
}
