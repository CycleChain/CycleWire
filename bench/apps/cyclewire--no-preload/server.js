// The CycleWire app (../cyclewire/server.js) without preloading: <head> has
// the entry and its imports, and no action's code, so a tap on "Add to cart"
// fetches the action's code before it can send anything.
import { fileURLToPath } from 'node:url';
import { manifestOf, serve } from '../cyclewire/page.js';

const { manifest, chunks } = manifestOf(new URL('dist/js/.vite/manifest.json', import.meta.url));

serve({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    head: [
        ...chunks('src/main.js').map((file) => `<link rel="modulepreload" href="/js/${file}">`),
        `<script type="module" src="/js/${manifest['src/main.js'].file}"></script>`,
    ].join('\n'),
});
