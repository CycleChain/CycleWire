/**
 * The proxy every stack is measured through. It terminates TLS and speaks
 * HTTP/2 to the browser, forwards requests to the stack's own server over
 * HTTP/1.1 (or to the shared server, for /assets/app.css, /images/ and
 * /api/), and applies one delivery policy to every response, whatever the
 * stack's server would have done:
 *
 * - The upstream is asked for uncompressed bodies, and the proxy compresses
 *   text with brotli: quality 5, streamed and flushed chunk by chunk, for
 *   responses rendered per request (HTML, JSON, RSC payloads, event streams);
 *   quality 11 for static assets (JavaScript, CSS, SVG, WASM, manifests).
 * - Static assets are cacheable for a year and immutable. Everything else is
 *   `no-store`, so every visit renders on the server.
 * - Validators (ETag, Last-Modified) are dropped, so no stack gets 304s.
 *
 * See METHODOLOGY.md for why.
 */
import { createHash } from 'node:crypto';
import http from 'node:http';
import http2 from 'node:http2';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

export const POLICY = {
    dynamicQuality: 5,
    staticQuality: 11,
    staticCache: 'public, max-age=31536000, immutable',
    dynamicCache: 'no-store',
};

const brotli = promisify(zlib.brotliCompress);

/** Request headers that are not forwarded as they are. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'http2-settings', 'host']);
/** Response headers the proxy replaces with its own policy. */
const REPLACED = new Set([...HOP_BY_HOP, 'content-length', 'content-encoding', 'cache-control', 'expires', 'pragma', 'etag', 'last-modified', 'age', 'vary', 'alt-svc', 'date']);

const STATIC = /^(?:text\/(?:javascript|css)|application\/(?:javascript|x-javascript|wasm|manifest\+json)|image\/|font\/|audio\/|video\/)/;
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|x-javascript|json|manifest\+json|xml|wasm|x-ndjson)|image\/svg\+xml)/;

/** @param {string} type the Content-Type, lower-cased, without parameters */
export const isStatic = (type) => STATIC.test(type);
/** @param {string} type */
export const isCompressible = (type) => COMPRESSIBLE.test(type);

const mediaType = (header) => String(header ?? '').split(';')[0].trim().toLowerCase();

function decoder(encoding) {
    if (encoding === 'br') return zlib.createBrotliDecompress();
    if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
    if (encoding === 'deflate') return zlib.createInflate();
    return null;
}

async function collect(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * @param {object} options
 * @param {Buffer} options.key
 * @param {Buffer} options.cert
 * @param {(pathname: string) => { port: number, host?: string }} options.route picks the upstream
 */
export function createProxy({ key, cert, route }) {
    // Idle connections to the stacks' servers close after 4 s, before Node's
    // servers close them (5 s by default): reusing a socket the server is
    // closing is how a request fails with a reset.
    const agent = new http.Agent({ keepAlive: true, maxSockets: 256, timeout: 4000 });
    /** Compressed static assets by content hash: compressing at quality 11 costs time once. */
    const compressed = new Map();

    async function compressStatic(raw, type) {
        const hash = createHash('sha256').update(raw).digest('hex');
        let pending = compressed.get(hash);
        if (!pending) {
            const mode = type.startsWith('font/') ? zlib.constants.BROTLI_MODE_FONT : zlib.constants.BROTLI_MODE_TEXT;
            pending = brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: POLICY.staticQuality, [zlib.constants.BROTLI_PARAM_MODE]: mode, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
            compressed.set(hash, pending);
        }
        return pending;
    }

    function respond(req, res, response) {
        const status = response.statusCode ?? 502;
        const type = mediaType(response.headers['content-type']);
        const cacheable = isStatic(type) && status === 200;
        /** @type {Record<string, string | string[] | number>} */
        const headers = {};
        for (const [name, value] of Object.entries(response.headers)) {
            if (!REPLACED.has(name) && value !== undefined) headers[name] = value;
        }
        headers['cache-control'] = cacheable ? POLICY.staticCache : POLICY.dynamicCache;

        if (req.method === 'HEAD' || status === 204 || status === 304 || status < 200) {
            response.resume();
            res.writeHead(status, headers);
            return res.end();
        }

        const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
        const decode = encoding === 'identity' ? null : decoder(encoding);
        /** @type {NodeJS.ReadableStream} */
        const source = decode ? response.pipe(decode) : response;
        const wantsBrotli = /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));

        if (!isCompressible(type) || !wantsBrotli) {
            res.writeHead(status, headers);
            return source.pipe(res);
        }
        headers['content-encoding'] = 'br';
        headers.vary = 'accept-encoding';

        if (cacheable) {
            collect(source)
                .then((raw) => compressStatic(raw, type))
                .then((body) => {
                    headers['content-length'] = body.length;
                    res.writeHead(status, headers);
                    res.end(body);
                })
                .catch((error) => fail(res, error));
            return;
        }

        // Rendered per request: stream it, flushing each chunk as it arrives,
        // so a stack that streams its HTML keeps the benefit.
        res.writeHead(status, headers);
        const br = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: POLICY.dynamicQuality, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } });
        br.pipe(res);
        source.on('data', (chunk) => {
            br.write(chunk);
            br.flush();
        });
        source.on('end', () => br.end());
        source.on('error', (error) => br.destroy(error));
    }

    function fail(res, error) {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': POLICY.dynamicCache });
        res.end(`Bad gateway: ${error.message}`);
    }

    /** @param {http2.Http2ServerRequest} req @param {http2.Http2ServerResponse} res */
    function forward(req, res) {
        const authority = String(req.headers[':authority'] ?? req.headers.host ?? 'localhost');
        /** @type {Record<string, string | string[]>} */
        const headers = {};
        for (const [name, value] of Object.entries(req.headers)) {
            if (!name.startsWith(':') && !HOP_BY_HOP.has(name) && value !== undefined) headers[name] = value;
        }
        Object.assign(headers, {
            host: authority,
            'accept-encoding': 'identity',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': authority,
            'x-forwarded-for': '127.0.0.1',
        });
        const target = route(new URL(req.url, 'https://localhost').pathname);
        const safe = req.method === 'GET' || req.method === 'HEAD';
        /** @param {boolean} retried */
        const send = (retried) => {
            const upstream = http.request({ host: target.host ?? '127.0.0.1', port: target.port, method: req.method, path: req.url, headers, agent }, (response) => respond(req, res, response));
            upstream.on('error', (error) => {
                // A kept-alive socket the server had just closed: a GET or HEAD
                // goes once more, on a new connection, as Node's docs advise.
                if (!retried && safe && upstream.reusedSocket && /** @type {any} */ (error).code === 'ECONNRESET') send(true);
                else fail(res, error);
            });
            if (safe) upstream.end();
            else req.pipe(upstream);
        };
        send(false);
    }

    return http2.createSecureServer({ key, cert, allowHTTP1: true }, forward);
}
