// The CycleWire app's build (../cyclewire/vite.config.js), for this variant's
// entry. The actions come from ../cyclewire/src/actions/; dedupe resolves the
// cyclewire they import from this folder, so there is one copy of it.
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/js/',
    resolve: { dedupe: ['cyclewire'] },
    build: {
        outDir: 'dist/js',
        assetsDir: '',
        manifest: true,
        rollupOptions: { input: 'src/main.js' },
        modulePreload: { polyfill: false },
    },
});
