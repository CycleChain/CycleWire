import { defineConfig } from 'astro/config';
import cyclewire from 'cyclewire/vite';

export default defineConfig({
    // Every file in src/actions/ becomes an action, loaded when someone reaches for it.
    vite: { plugins: [cyclewire({ actions: 'src/actions', devtools: true })] },
});
