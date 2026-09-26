// The reference page with CycleWire, set up the way its documentation
// recommends: the core as a module in <head>, actions in their own chunks,
// the action most visitors use first (add to cart) preloaded with the page,
// the quick view's data prefetched on intent, and the cart header bound to a
// store the server serializes (page.js).
import { fileURLToPath } from 'node:url';
import { manifestOf, serve } from './page.js';

const { manifest, chunks } = manifestOf(new URL('dist/js/.vite/manifest.json', import.meta.url));
// The entry, and the add-to-cart action with its imports: a tap on it right after the page
// appears then waits only for the server, not for its code.
const preloads = [...new Set([...chunks('src/main.js'), ...chunks('src/actions/cart.js')])];

serve({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    head: [
        ...preloads.map((file) => `<link rel="modulepreload" href="/js/${file}">`),
        `<script type="module" src="/js/${manifest['src/main.js'].file}"></script>`,
    ].join('\n'),
});
