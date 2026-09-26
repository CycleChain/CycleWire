// The Wirestore page with Hotwire. One plain Node server renders every page,
// frame and stream, and serves the bundle esbuild built. Turbo marks what it
// asks for: frame navigations carry a Turbo-Frame header naming the frame,
// and form posts list text/vnd.turbo-stream.html in their Accept header.
// Those get the frame or the Turbo Streams they need; every other request
// gets what the reference server sends (the full page, or a redirect after a
// form post), so the page works without JavaScript too.
//
//   GET  /             the page; with Turbo-Frame, only that frame
//   POST /cart         id → adds one; Turbo Streams for the cart header, otherwise back to the page
//   POST /newsletter   email → a Turbo Stream with the message, otherwise the page that shows it
//   GET  /js/*         the bundle
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { add, cartCookie, readCart } from '../../scenario/cart.js';
import { summary } from '../../scenario/catalog.js';
import { TYPES, back, file, form, seeOther, send } from '../../scenario/http.js';
import { INVALID_EMAIL, thanks, validEmail } from '../../scenario/markup.js';
import { stateFrom } from '../../scenario/render.js';
import { FRAMES, cartStream, newsletterStream, page } from './views.js';

const HTML = TYPES['.html'];
const STREAM = 'text/vnd.turbo-stream.html; charset=utf-8';
const JS = fileURLToPath(new URL('dist/js/', import.meta.url));

// The bundle's file name carries a hash of its content (build.js).
const { application } = JSON.parse(readFileSync(new URL('dist/manifest.json', import.meta.url), 'utf8'));
const SCRIPT = `/js/${application}`;

/** @param {import('node:http').IncomingMessage} req */
const acceptsStreams = (req) => String(req.headers.accept ?? '').includes('text/vnd.turbo-stream.html');

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
        if (req.method === 'GET' && url.pathname === '/') {
            const state = stateFrom(url, readCart(req.headers.cookie));
            const frame = FRAMES.get(req.headers['turbo-frame']);
            // The same URL answers with a page or a frame, depending on Turbo-Frame.
            return send(res, 200, frame ? frame(state) : page(state, SCRIPT), HTML, { vary: 'Turbo-Frame' });
        }
        if (req.method === 'POST' && url.pathname === '/cart') {
            const next = add(readCart(req.headers.cookie), (await form(req)).get('id') ?? '');
            if (!next) return send(res, 404, 'No such product');
            const cookie = { 'set-cookie': cartCookie(next) };
            return acceptsStreams(req) ? send(res, 200, cartStream(summary(next)), STREAM, cookie) : seeOther(res, back(req), cookie);
        }
        if (req.method === 'POST' && url.pathname === '/newsletter') {
            const email = ((await form(req)).get('email') ?? '').trim();
            const valid = validEmail(email);
            // A rejected address is a 422, as Turbo expects of a form that failed validation.
            if (acceptsStreams(req)) return send(res, valid ? 200 : 422, newsletterStream(valid ? thanks(email) : INVALID_EMAIL), STREAM);
            return seeOther(res, valid ? `/?subscribed=${encodeURIComponent(email)}` : '/?newsletter=invalid');
        }
        if (req.method === 'GET' && url.pathname.startsWith('/js/')) return await file(res, JS, url.pathname.slice('/js/'.length));
        send(res, 404, 'Not found');
    } catch (error) {
        send(res, error.status ?? 500, error.status ? error.message : 'Server error');
        if (!error.status) console.error(error);
    }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Listening on http://127.0.0.1:${port}`));
