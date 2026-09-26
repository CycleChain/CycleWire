/**
 * Serves the morph test page on 127.0.0.1, with nothing from the network:
 *
 *   /                 the page (?lib=cyclewire|morphdom|idiomorph)
 *   /bench/…          this benchmark's own modules (the harness, the cases, the rows)
 *   /lib/<library>/…  each library's published files, from node_modules
 *
 * The page is cross-origin isolated (COOP and COEP), which gives
 * performance.now() the finest resolution each browser allows.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const BENCH = fileURLToPath(new URL('../../', import.meta.url));

/** Where each library's files are served from. */
export const LIBRARY_DIRS = {
    // cyclewire/morph imports its siblings (dom.js, focus.js), so the whole folder.
    cyclewire: dirname(fileURLToPath(import.meta.resolve('cyclewire/morph'))),
    morphdom: join(dirname(require.resolve('morphdom/package.json')), 'dist'),
    idiomorph: dirname(fileURLToPath(import.meta.resolve('idiomorph'))),
};

// Modules only: the page itself is generated.
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Morph micro benchmark</title>
<style>
body { margin: 0; font: 16px/1.4 system-ui, sans-serif; }
.case, #speed { padding: 8px; }
</style>
</head>
<body>
<main id="stage"></main>
<div id="speed"></div>
<script type="module" src="/bench/micro/morph/page.js"></script>
</body>
</html>
`;

/**
 * @param {string} root @param {string} path
 * @returns {string | null} the file, if it is inside root
 */
function inside(root, path) {
    const file = normalize(join(root, decodeURIComponent(path)));
    return file.startsWith(root.endsWith(sep) ? root : root + sep) ? file : null;
}

/** @returns {Promise<{ url: string, close(): Promise<void> }>} */
export async function startServer() {
    const server = createServer(async (request, response) => {
        const headers = {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cache-Control': 'no-store',
        };
        const { pathname } = new URL(request.url ?? '/', 'http://localhost');
        /** @type {string | null} */
        let file = null;
        if (pathname === '/') {
            response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
            response.end(PAGE);
            return;
        }
        const library = /^\/lib\/([a-z]+)\/(.+)$/.exec(pathname);
        if (library && library[1] in LIBRARY_DIRS) file = inside(LIBRARY_DIRS[/** @type {keyof typeof LIBRARY_DIRS} */ (library[1])], library[2]);
        else if (pathname.startsWith('/bench/') && !pathname.includes('/node_modules/')) file = inside(BENCH, pathname.slice('/bench/'.length));
        const type = file && TYPES[/** @type {keyof typeof TYPES} */ (extname(file))];
        if (!file || !type) {
            response.writeHead(404, headers).end();
            return;
        }
        try {
            const body = await readFile(file);
            response.writeHead(200, { ...headers, 'Content-Type': type }).end(body);
        } catch {
            response.writeHead(404, headers).end();
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    return {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}
