#!/usr/bin/env node
/**
 * Zero-dependency static server for local development and the Playwright suite.
 *
 *   /            → site/          (the landing page, so its "./dist/…" links resolve as on GitHub Pages)
 *   /dist/       → dist/
 *   /examples/   → examples/dist/ (built with `npm run examples`, laid out as on GitHub Pages)
 *   /docs/       → docs-site/dist/ (built with `npm run build` in docs-site/)
 *   /bench/      → the raw benchmark results, as on GitHub Pages
 *   /fixtures/   → test/fixtures/
 *
 * The landing page gets the version stamp and the Benchmark section, built at
 * start from bench/results/ (--local-results includes your own *.local.json runs).
 *
 * Test helpers:
 *   ?delay=ms                       hold the response
 *   /fail-once/<token>/<path>       answer 500 the first time a token is seen, then serve <path>
 *   /echo                           echo a (form) request back as HTML
 *   /health                         readiness probe
 *   /sse/listen?channel=            a Server-Sent Events stream (retry: 200 ms)
 *   /sse/fail?channel=&times=       answers 500 that many times for the channel, then streams
 *   POST /sse/send?channel=         writes the request body, raw SSE, to the channel's listeners
 *   POST /sse/drop?channel=         ends the channel's streams, as a dropped connection would
 *   /sse/stats?channel=             { open, connects, lastEventId } for the channel
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../bench/scripts/build-site.js';
import { insertBenchmark, stamp, stampSizes, version } from './site.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index > -1 ? process.argv[index + 1] : fallback;
};
const port = Number(option('--port', process.env.PORT || 4173));
const host = option('--host', '127.0.0.1');

const benchPage = join(root, 'bench', '.cache', 'site');
const bench = await buildSite({ out: benchPage, local: process.argv.includes('--local-results') });
const landing = join(root, 'site', 'index.html');

const mounts = [
    ['/dist/', join(root, 'dist')],
    ['/examples/', join(root, 'examples', 'dist')],
    ['/docs/', join(root, 'docs-site', 'dist')],
    ['/bench/', benchPage],
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

/** Server-Sent Events channels for the stream tests. @type {Map<string, { open: Set<import('node:http').ServerResponse>, connects: number, failures: number, lastEventId: string | null }>} */
const channels = new Map();
const channel = (/** @type {string} */ name) => {
    if (!channels.has(name)) channels.set(name, { open: new Set(), connects: 0, failures: 0, lastEventId: null });
    return /** @type {NonNullable<ReturnType<typeof channels.get>>} */ (channels.get(name));
};

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URL} url */
async function sse(req, res, url) {
    const name = url.searchParams.get('channel') || 'default';
    const state = channel(name);
    const action = url.pathname.slice('/sse/'.length);
    if (action === 'stats') return send(res, 200, JSON.stringify({ open: state.open.size, connects: state.connects, lastEventId: state.lastEventId }), types['.json']);
    if (req.method === 'POST' && action === 'send') {
        let body = '';
        for await (const chunk of req) body += chunk;
        for (const listener of state.open) listener.write(body);
        return send(res, 200, JSON.stringify({ listeners: state.open.size }), types['.json']);
    }
    if (req.method === 'POST' && action === 'drop') {
        for (const listener of state.open) listener.end();
        state.open.clear();
        return send(res, 200, '{}', types['.json']);
    }
    if (action === 'fail' && state.failures < (Number(url.searchParams.get('times')) || 1)) {
        state.failures++;
        return send(res, 500, 'failing on purpose');
    }
    if (action !== 'listen' && action !== 'fail') return send(res, 404, 'Not found');
    state.connects++;
    state.lastEventId = /** @type {string | undefined} */ (req.headers['last-event-id']) ?? url.searchParams.get('last-event-id');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 200\n\n');
    state.open.add(res);
    req.on('close', () => state.open.delete(res));
}

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
    if (url.pathname.startsWith('/sse/')) return sse(req, res, url);

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
        let body = await readFile(file);
        // The same version stamp and benchmark section as the deployed site (scripts/site.js).
        if (extname(file) === '.html') {
            let html = stamp(body.toString('utf8'), await version()).html;
            if (file === landing) {
                html = insertBenchmark(html, bench.html);
                // Sizes appear once `npm run size` has written them.
                const sizes = await readFile(join(root, 'dist', 'sizes.json'), 'utf8').catch(() => null);
                if (sizes) html = stampSizes(html, JSON.parse(sizes)).html;
            }
            body = Buffer.from(html);
        }
        send(res, 200, body, types[extname(file)] || 'application/octet-stream');
    } catch {
        send(res, 404, 'Not found');
    }
}).listen(port, host, () => {
    console.log(`CycleWire dev server → http://${host}:${port}/`);
});
