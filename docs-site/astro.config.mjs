// The documentation site, served at /CycleWire/docs/ next to the landing page.
// Its pages are docs/*.md, copied in by sync-docs.js: edit those, not
// src/content/docs/, which is written again on every build.
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { watch } from 'node:fs';
import starlightLinksValidator from 'starlight-links-validator';
import { DOCS, sync } from './sync-docs.js';

const { sidebar } = await sync();

export default defineConfig({
    site: 'https://cyclechain.github.io',
    base: '/CycleWire/docs',
    trailingSlash: 'always',
    integrations: [
        starlight({
            title: 'CycleWire',
            description: 'Server-rendered HTML, wired on intent: CycleWire documentation.',
            logo: { src: './src/assets/logo.svg' },
            favicon: '/favicon.svg',
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/CycleChain/CycleWire' }],
            editLink: { baseUrl: 'https://github.com/CycleChain/CycleWire/edit/main/docs/' },
            customCss: ['./src/styles/theme.css'],
            // Django templates highlight as Jinja, their near relative.
            expressiveCode: { shiki: { langAlias: { django: 'jinja' } } },
            sidebar,
            plugins: [starlightLinksValidator()],
        }),
        {
            // While developing, edits to docs/ reach the site without a restart.
            name: 'cyclewire-docs-sync',
            hooks: {
                'astro:server:setup': ({ logger }) => {
                    watch(DOCS, () => sync().catch((error) => logger.error(error.message)));
                },
            },
        },
    ],
});
