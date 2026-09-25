/**
 * The page server behind the apps that render the reference markup (or their
 * own template of it) with plain Node. It renders the page on every request
 * and handles the plain form posts that work without JavaScript. An app passes
 * hooks to add its own attributes and scripts, a folder of built files served
 * under /js/, and, if it has its own template, a render function.
 *
 *   GET  /              the page; q, category, view, subscribed and newsletter describe its state
 *   POST /cart          id → adds one, then back to the page it came from
 *   POST /newsletter    email → /?subscribed=<email>, or /?newsletter=invalid
 *   GET  /js/*          the app's built files
 */
import { createServer } from 'node:http';
import { add, cartCookie, readCart } from './cart.js';
import { back, file, form, seeOther, send } from './http.js';
import { validEmail } from './markup.js';
import { renderPage, stateFrom } from './render.js';

/**
 * @param {object} options
 * @param {(state: import('./render.js').State) => import('./render.js').Hooks} [options.hooks]
 * @param {(state: import('./render.js').State, hooks: import('./render.js').Hooks) => string} [options.render] the reference render by default
 * @param {string} [options.js] folder served under /js/
 */
export function createPageServer({ hooks = () => ({}), render = renderPage, js } = {}) {
    return createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
            if (req.method === 'GET' && url.pathname === '/') {
                const state = stateFrom(url, readCart(req.headers.cookie));
                return send(res, 200, render(state, hooks(state)), 'text/html; charset=utf-8');
            }
            if (req.method === 'POST' && url.pathname === '/cart') {
                const next = add(readCart(req.headers.cookie), (await form(req)).get('id') ?? '');
                if (!next) return send(res, 404, 'No such product');
                return seeOther(res, back(req), { 'set-cookie': cartCookie(next) });
            }
            if (req.method === 'POST' && url.pathname === '/newsletter') {
                const email = ((await form(req)).get('email') ?? '').trim();
                return seeOther(res, validEmail(email) ? `/?subscribed=${encodeURIComponent(email)}` : '/?newsletter=invalid');
            }
            if (req.method === 'GET' && js && url.pathname.startsWith('/js/')) return await file(res, js, url.pathname.slice('/js/'.length));
            send(res, 404, 'Not found');
        } catch (error) {
            send(res, error.status ?? 500, error.status ? error.message : 'Server error');
            if (!error.status) console.error(error);
        }
    });
}

/** Starts a page server on $PORT (for the apps' start scripts). */
export function listen(options) {
    const port = Number(process.env.PORT) || 3000;
    const server = createPageServer(options);
    server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Listening on http://127.0.0.1:${port}`));
    return server;
}
