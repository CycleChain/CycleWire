import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import http2 from 'node:http2';
import { after, before, test } from 'node:test';
import zlib from 'node:zlib';
import { certificate } from '../proxy/cert.js';
import { POLICY, createProxy, isCompressible, isStatic } from '../proxy/server.js';

test('content types are sorted into static and per-request', () => {
    for (const type of ['text/javascript', 'application/javascript', 'text/css', 'image/webp', 'font/woff2', 'application/wasm']) assert.ok(isStatic(type), type);
    for (const type of ['text/html', 'application/json', 'text/x-component', 'text/event-stream', 'text/plain']) assert.ok(!isStatic(type), type);
    for (const type of ['text/html', 'text/css', 'application/json', 'image/svg+xml', 'text/x-component']) assert.ok(isCompressible(type), type);
    for (const type of ['image/webp', 'font/woff2']) assert.ok(!isCompressible(type), type);
});

/** An upstream that streams HTML in two parts, serves a script, and gzips a JSON body. */
let release;
const upstream = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', etag: '"abc"', 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] });
        res.write('<!doctype html><p>first</p>');
        release = () => res.end('<p>second</p>');
    } else if (req.url === '/app.js') {
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache', 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT' });
        res.end('export const answer = 42;\n'.repeat(50));
    } else if (req.url === '/data') {
        res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'x-seen-encoding': String(req.headers['accept-encoding']), 'x-seen-host': String(req.headers.host) });
        res.end(zlib.gzipSync(JSON.stringify({ ok: true })));
    } else {
        res.writeHead(404);
        res.end();
    }
});
let proxy;
let client;

before(async () => {
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const { key, cert } = certificate();
    proxy = createProxy({ key, cert, route: () => ({ port: upstream.address().port }) });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    client = http2.connect(`https://localhost:${proxy.address().port}`, { rejectUnauthorized: false });
});

after(() => {
    client?.close();
    proxy?.close();
    upstream.close();
});

function get(path) {
    const stream = client.request({ ':path': path, 'accept-encoding': 'br, gzip' });
    return new Promise((resolve, reject) => {
        stream.on('response', (headers) => resolve({ headers, stream }));
        stream.on('error', reject);
    });
}

async function readAll(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

test('HTML is brotli-compressed as it streams, never cached, and keeps its cookies', async () => {
    const { headers, stream } = await get('/');
    assert.equal(headers['content-encoding'], 'br');
    assert.equal(headers['cache-control'], POLICY.dynamicCache);
    assert.equal(headers.etag, undefined);
    assert.deepEqual(headers['set-cookie'], ['a=1; Path=/', 'b=2; Path=/']);
    // The first part arrives before the upstream has finished.
    const decoder = zlib.createBrotliDecompress();
    stream.pipe(decoder);
    const [first] = await once(decoder, 'data');
    assert.match(first.toString(), /first/);
    release();
    const rest = (await readAll(decoder)).toString();
    assert.match(rest, /second/);
});

test('scripts are compressed at quality 11 and cacheable for a year', async () => {
    const { headers, stream } = await get('/app.js');
    const body = await readAll(stream);
    assert.equal(headers['content-encoding'], 'br');
    assert.equal(headers['cache-control'], POLICY.staticCache);
    assert.equal(headers['last-modified'], undefined);
    assert.equal(Number(headers['content-length']), body.length);
    assert.match(zlib.brotliDecompressSync(body).toString(), /answer = 42/);
});

test('the upstream is asked for identity, and a compressed answer is recompressed', async () => {
    const { headers, stream } = await get('/data');
    assert.equal(headers['x-seen-encoding'], 'identity');
    assert.match(headers['x-seen-host'], /^localhost:\d+$/);
    assert.equal(headers['content-encoding'], 'br');
    assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(await readAll(stream)).toString()), { ok: true });
});
