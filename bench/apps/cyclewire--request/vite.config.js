// The CycleWire app's build (../cyclewire/vite.config.js), for this variant's
// entry: the core and the prefetch plugin in the entry, and cyclewire/request,
// with the morph and message code it brings, and the quick view action in
// chunks of their own.
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/js/',
    build: {
        outDir: 'dist/js',
        assetsDir: '',
        manifest: true,
        rollupOptions: { input: 'src/main.js' },
        // Off rather than imported, as the backend-integration guide allows.
        // Vite's preload helper then checks for modulepreload support itself.
        modulePreload: { polyfill: false },
    },
});
