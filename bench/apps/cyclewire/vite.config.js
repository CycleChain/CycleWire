// Vite bundles the entry (the core and one loader per action) and splits each
// action, with the optional modules it imports, into chunks. When an action is
// imported, Vite preloads the chunks it depends on in parallel. The server
// reads the manifest to write the entry's tags (Vite's backend integration).
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/js/',
    build: {
        outDir: 'dist/js',
        assetsDir: '',
        manifest: true,
        rollupOptions: { input: 'src/main.js' },
        // The backend-integration guide asks to either import the modulepreload
        // polyfill or turn it off. It is off: Vite's preload helper then checks
        // for modulepreload support itself. Preloading an action's imports stays on.
        modulePreload: { polyfill: false },
    },
});
