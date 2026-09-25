// Vite bundles Alpine with the page's stores and components into one module,
// and writes a manifest that the server reads to render the entry's <script>
// tag (Vite's backend integration). The page itself comes from server.js.
import { defineConfig } from 'vite';

export default defineConfig({
    // The entry is a script rather than an index.html.
    input: 'src/main.js',
    build: {
        // dist/js/ is served under /js/; the manifest stays in dist/.vite/.
        assetsDir: 'js',
        manifest: true,
        // The build is one chunk, loaded by its own <script> tag, so the page
        // has no <link rel="modulepreload"> for the polyfill to handle.
        modulePreload: { polyfill: false },
    },
});
