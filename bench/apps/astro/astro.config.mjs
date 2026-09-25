// @ts-check
// Wirestore with Astro: the page is rendered on demand by the Node adapter's
// standalone server, and its interactive parts are Preact islands.
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';

export default defineConfig({
    // Every request renders the page: the header reads the cart cookie.
    output: 'server',
    adapter: node({ mode: 'standalone' }),
    integrations: [preact()],
    security: {
        // The server runs behind a proxy that terminates TLS and answers at
        // https://localhost:<port>. Trusting its X-Forwarded-Proto and
        // X-Forwarded-Host for that address gives Astro.url the origin the
        // browser uses, so the origin check on form posts and actions (on by
        // default) compares like with like. The port changes between runs.
        allowedDomains: [{ protocol: 'https', hostname: 'localhost' }],
    },
});
