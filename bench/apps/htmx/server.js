// The Wirestore page with htmx. One plain Node server renders every page and
// fragment, and serves htmx itself from the npm package. htmx marks its
// requests with HX-Request: true: those get the fragment the interaction
// needs, and every other request gets what the reference server sends (the
// full page, or a redirect after a form post), so the page works without
// JavaScript too.
//
//   GET  /             the page; with HX-Request, the results, or the quick view with ?view=
//   POST /cart         id → adds one; with HX-Request, the cart header, otherwise back to the page
//   POST /newsletter   email → with HX-Request, the message, otherwise the page that shows it
//   GET  /js/htmx.<hash>.min.js
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { add, cartCookie, readCart } from '../../scenario/cart.js';
import { product, summary } from '../../scenario/catalog.js';
import { TYPES, back, form, seeOther, send } from '../../scenario/http.js';
import { INVALID_EMAIL, esc, thanks, validEmail } from '../../scenario/markup.js';
import { stateFrom } from '../../scenario/render.js';
import { cartHeader, controls, details, page, results } from './views.js';

const HTML = TYPES['.html'];

// htmx.min.js as the package ships it, at a URL that changes with its
// content, so it can be cached for good.
const HTMX = readFileSync(fileURLToPath(import.meta.resolve('htmx.org/dist/htmx.min.js')));
const HTMX_PATH = `/js/htmx.${createHash('sha256').update(HTMX).digest('hex').slice(0, 10)}.min.js`;

/** @param {import('node:http').IncomingMessage} req */
const fromHtmx = (req) => req.headers['hx-request'] === 'true';

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
        if (req.method === 'GET' && url.pathname === '/') {
            const state = stateFrom(url, readCart(req.headers.cookie));
            // The same URL answers with a page or a fragment, depending on HX-Request.
            const vary = { vary: 'HX-Request' };
            if (!fromHtmx(req)) return send(res, 200, page(state, HTMX_PATH), HTML, vary);
            if (url.searchParams.has('view')) {
                const found = product(state.view);
                return found ? send(res, 200, details(found), HTML, vary) : send(res, 404, 'No such product', TYPES['.txt'], vary);
            }
            // The search form always sends q. A category link sends none: it
            // clears the search, so the search form and the links come back too.
            return send(res, 200, results(state) + (url.searchParams.has('q') ? '' : controls(state)), HTML, vary);
        }
        if (req.method === 'POST' && url.pathname === '/cart') {
            const next = add(readCart(req.headers.cookie), (await form(req)).get('id') ?? '');
            if (!next) return send(res, 404, 'No such product');
            const cookie = { 'set-cookie': cartCookie(next) };
            return fromHtmx(req) ? send(res, 200, cartHeader(summary(next)), HTML, cookie) : seeOther(res, back(req), cookie);
        }
        if (req.method === 'POST' && url.pathname === '/newsletter') {
            const email = ((await form(req)).get('email') ?? '').trim();
            const valid = validEmail(email);
            // htmx swaps 2xx answers, so an invalid address is a 200 whose
            // message says so, rather than a 422 and a responseHandling rule.
            if (fromHtmx(req)) return send(res, 200, esc(valid ? thanks(email) : INVALID_EMAIL), HTML);
            return seeOther(res, valid ? `/?subscribed=${encodeURIComponent(email)}` : '/?newsletter=invalid');
        }
        if (req.method === 'GET' && url.pathname === HTMX_PATH) {
            return send(res, 200, HTMX, TYPES['.js'], { 'cache-control': 'public, max-age=31536000, immutable' });
        }
        send(res, 404, 'Not found');
    } catch (error) {
        send(res, error.status ?? 500, error.status ? error.message : 'Server error');
        if (!error.status) console.error(error);
    }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Listening on http://127.0.0.1:${port}`));
