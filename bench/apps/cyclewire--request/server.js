// The CycleWire app (../cyclewire/server.js) with its interactions made by
// cyclewire/request, the way htmx makes them: links and forms ask this server
// for HTML and put it into the page. A request made by cyclewire/request is a
// fetch(), which the browser marks with Sec-Fetch-Dest: empty, where a
// navigation says document: fetches get the fragment the interaction needs,
// and every other request what the reference server sends (the full page, or
// a redirect after a form post), so the page works without JavaScript too.
//
//   GET  /             the page; fetched, the results, or the quick view with ?view=
//   POST /cart         id → adds one; fetched, the header's cart summary, otherwise back to the page
//   POST /newsletter   email → fetched, the message, otherwise the page that shows it
//   GET  /js/*         the Vite build
import { createServer } from 'node:http';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { add, cartCookie, readCart } from '../../scenario/cart.js';
import { product, summary } from '../../scenario/catalog.js';
import { TYPES, back, file, form, seeOther, send } from '../../scenario/http.js';
import { INVALID_EMAIL, esc, thanks, validEmail } from '../../scenario/markup.js';
import { stateFrom } from '../../scenario/render.js';
import { manifestOf } from '../cyclewire/page.js';
import { cartSummary, controls, details, page, results } from './views.js';

const HTML = TYPES['.html'];
const JS = fileURLToPath(new URL('dist/js/', import.meta.url));

const { manifest, chunks } = manifestOf(new URL('dist/js/.vite/manifest.json', import.meta.url));
// Vite's manifest names a module by its path from this folder.
const REQUEST = relative(fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(import.meta.resolve('cyclewire/request')));
// The entry, and cyclewire/request with its imports: add to cart, the action
// most visitors use first, runs it, so a tap on it right after the page
// appears waits only for the server, not for its code.
const preloads = [...new Set([...chunks('src/main.js'), ...chunks(REQUEST)])];
const HEAD = [
    ...preloads.map((path) => `<link rel="modulepreload" href="/js/${path}">`),
    `<script type="module" src="/js/${manifest['src/main.js'].file}"></script>`,
].join('\n');

/** @param {import('node:http').IncomingMessage} req */
const fetched = (req) => req.headers['sec-fetch-dest'] === 'empty';

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
        if (req.method === 'GET' && url.pathname === '/') {
            const state = stateFrom(url, readCart(req.headers.cookie));
            // The same URL answers with a page or a fragment, depending on Sec-Fetch-Dest.
            const vary = { vary: 'Sec-Fetch-Dest' };
            if (!fetched(req)) return send(res, 200, page(state, HEAD), HTML, vary);
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
            return fetched(req) ? send(res, 200, cartSummary(summary(next)), HTML, cookie) : seeOther(res, back(req), cookie);
        }
        if (req.method === 'POST' && url.pathname === '/newsletter') {
            const email = ((await form(req)).get('email') ?? '').trim();
            const valid = validEmail(email);
            // An invalid address is a 422, the form's errors, which cyclewire/request shows like any answer.
            if (fetched(req)) return send(res, valid ? 200 : 422, esc(valid ? thanks(email) : INVALID_EMAIL), HTML);
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
