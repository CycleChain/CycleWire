// The prefetch plugin, for the CycleWire that the page's inline script
// started: an element's cw-prefetch data is fetched on intent, next to the
// action's code, and ctx.fetch takes it.
import { prefetch } from 'cyclewire/prefetch';

/** @type {any} */ (globalThis).CycleWire.use(prefetch());
