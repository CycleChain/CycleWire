import { defineConfig } from 'vite';
import cyclewire from 'cyclewire/vite';

export default defineConfig({
    // Every file in src/actions/ becomes an action, loaded when someone reaches for it.
    plugins: [cyclewire({ devtools: true })],
});
