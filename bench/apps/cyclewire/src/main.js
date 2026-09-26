// The only script the page loads up front: the core, with one loader per file
// in ./actions/, so each action becomes its own chunk (./actions/cart.js is
// "cart", and so on), and the prefetch plugin, which fetches an element's
// cw-prefetch data on intent next to its code.
import { fromGlob, start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';

start({ actions: fromGlob(import.meta.glob('./actions/*.js')), plugins: [prefetch()] });
