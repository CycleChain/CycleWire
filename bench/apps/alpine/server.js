// The Alpine.js app's server: the shared page server (scenario/server.js),
// rendering the app's own template (page.js) on every request, taking the
// form posts made without JavaScript, and serving the module Vite built. The
// module's <script> tag comes from Vite's manifest (Vite's backend
// integration).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listen } from '../../scenario/server.js';
import { renderPage } from './page.js';

const manifest = JSON.parse(readFileSync(new URL('dist/.vite/manifest.json', import.meta.url), 'utf8'));
// One chunk: the entry imports no other chunk and no CSS, so its <script> tag is all the page needs.
const head = `<script type="module" src="/${manifest['src/main.js'].file}"></script>`;

listen({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    render: renderPage,
    hooks: () => ({ head }),
});
