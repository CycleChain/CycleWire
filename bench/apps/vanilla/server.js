// The reference page plus one hand-written module in <head>.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listen } from '../../scenario/server.js';

const { app } = JSON.parse(readFileSync(new URL('dist/manifest.json', import.meta.url), 'utf8'));

listen({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    hooks: () => ({ head: `<script type="module" src="/js/${app}"></script>` }),
});
