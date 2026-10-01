// The reference page with CycleWire, set up the way its documentation
// recommends: the core as a module in <head>, with the action most visitors
// use first (add to cart) in the entry, every other action in a chunk of its
// own, and the quick view's data prefetched on intent (page.js).
import { fileURLToPath } from 'node:url';
import { manifestOf, serve } from './page.js';

const { manifest, chunks } = manifestOf(new URL('dist/js/.vite/manifest.json', import.meta.url));
// The entry, with add to cart in it, and the chunks it imports.
const preloads = chunks('src/main.js');

serve({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    head: [
        ...preloads.map((file) => `<link rel="modulepreload" href="/js/${file}">`),
        `<script type="module" src="/js/${manifest['src/main.js'].file}"></script>`,
    ].join('\n'),
});
