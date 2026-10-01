// The only script the page loads up front: the core, the prefetch plugin,
// which fetches an element's cw-prefetch data on intent next to its code, and
// Add to cart, the action most visitors use first, so a tap on it right after
// the page appears waits only for the server. Every other file in ./actions/
// is a chunk of its own, loaded when it is needed (./actions/catalog.js is
// "catalog", and so on).
import { fromGlob, start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';
import * as cart from './actions/cart.js';

start({
    actions: { ...fromGlob(import.meta.glob(['./actions/*.js', '!./actions/cart.js'])), cart: async () => cart },
    plugins: [prefetch()],
});
