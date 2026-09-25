#!/usr/bin/env node
/**
 * Zero-dependency static server for local development and the Playwright suite.
 *
 *   /            → site/          (the landing page, so its "./dist/…" links resolve as on GitHub Pages)
 *   /dist/       → dist/
 *   /fixtures/   → test/fixtures/
 *
 * Test helpers:
 *   ?delay=ms                       hold the response
 *   /fail-once/<token>/<path>       answer 500 the first time a token is seen, then serve <path>
 *   /echo                           echo a (form) request back as HTML
 *   /health                         readiness probe
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index > -1 ? process.argv[index + 1] : fallback;
};
const port = Number(option('--port', process.env.PORT || 4173));
const host = option('--host', '127.0.0.1');

const mounts = [
    ['/dist/', join(root, 'dist')],
    ['/fixtures/', join(root, 'test', 'fixtures')],
    ['/', join(root, 'site')],
];

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const failedTokens = new Set();

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
}

function locate(pathname) {
    for (const [prefix, dir] of mounts) {
        if (!pathname.startsWith(prefix)) continue;
        const file = resolve(dir, '.' + pathname.slice(prefix.length - 1));
        return file === dir || file.startsWith(dir + sep) ? file : null;
    }
    return null;
}

async function echo(req, res) {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://localhost');
    const fields = new URLSearchParams(req.method === 'GET' ? url.search : body);
    const rows = [...fields].map(([k, v]) => `<li data-field="${escape(k)}">${escape(k)}=${escape(v)}</li>`).join('');
    send(res, 200, `<!doctype html><title>echo</title><h1 id="echo">${escape(req.method)} /echo</h1><ul>${rows}</ul>`, types['.html']);
}

createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const delay = Math.min(Number(url.searchParams.get('delay')) || 0, 10_000);
    if (delay) await new Promise((done) => setTimeout(done, delay));

    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname === '/echo') return echo(req, res);

    let pathname = decodeURIComponent(url.pathname);
    const failOnce = /^\/fail-once\/([\w-]+)(\/.*)$/.exec(pathname);
    if (failOnce) {
        if (!failedTokens.has(failOnce[1])) {
            failedTokens.add(failOnce[1]);
            return send(res, 500, 'fail-once');
        }
        pathname = failOnce[2];
    }

    let file = locate(pathname);
    if (!file) return send(res, 404, 'Not found');
    try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
        send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream');
    } catch {
        send(res, 404, 'Not found');
    }
}).listen(port, host, () => {
    console.log(`CycleWire dev server → http://${host}:${port}/`);
});
