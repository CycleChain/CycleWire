/**
 * The shared server. The proxy sends these paths here for every stack, so
 * the stylesheet, the images and the JSON API are the same bytes and the same
 * code whichever stack is measured:
 *
 *   GET  /assets/app.css
 *   GET  /images/<id>.webp
 *   GET  /api/products?q=&category=   { count, items: [{ id, name, category, price }] }
 *   GET  /api/products/<id>           { id, name, category, price, description }
 *   GET  /api/cart                    { count, total, items }
 *   POST /api/cart        { id }      { count, total, items }, and sets the cart cookie
 *   POST /api/newsletter  { email }   200 { message } or 422 { message }
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { add, cartCookie, readCart } from './cart.js';
import { detail, isCategory, listing, product, search, summary } from './catalog.js';
import { file, json, send, sendJson } from './http.js';
import { IMAGES } from './images.js';
import { INVALID_EMAIL, thanks, validEmail } from './markup.js';

const SCENARIO = fileURLToPath(new URL('.', import.meta.url));

/** Paths the proxy routes to this server rather than to the stack. */
export const SHARED = /^\/(?:assets\/app\.css$|images\/|api\/)/;

const cartJson = (items) => ({ ...summary(items), items });

/** @type {import('node:http').RequestListener} */
export async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;
    try {
        if (req.method === 'GET' && pathname === '/assets/app.css') return await file(res, SCENARIO, 'app.css');
        if (req.method === 'GET' && /^\/images\/p\d{2}\.webp$/.test(pathname)) return await file(res, IMAGES, pathname.slice('/images/'.length));

        if (req.method === 'GET' && pathname === '/api/products') {
            const category = url.searchParams.get('category') ?? '';
            const items = search({ q: url.searchParams.get('q') ?? '', category: isCategory(category) ? category : '' }).map(listing);
            return sendJson(res, 200, { count: items.length, items });
        }
        const one = /^\/api\/products\/(p\d{2})$/.exec(pathname);
        if (req.method === 'GET' && one) {
            const found = product(one[1]);
            return found ? sendJson(res, 200, detail(found)) : sendJson(res, 404, { message: 'No such product.' });
        }
        if (pathname === '/api/cart') {
            const items = readCart(req.headers.cookie);
            if (req.method === 'GET') return sendJson(res, 200, cartJson(items));
            if (req.method === 'POST') {
                const next = add(items, String((await json(req)).id ?? ''));
                if (!next) return sendJson(res, 404, { message: 'No such product.' });
                return sendJson(res, 200, cartJson(next), { 'set-cookie': cartCookie(next) });
            }
        }
        if (req.method === 'POST' && pathname === '/api/newsletter') {
            const email = String((await json(req)).email ?? '').trim();
            return validEmail(email) ? sendJson(res, 200, { message: thanks(email) }) : sendJson(res, 422, { message: INVALID_EMAIL });
        }
        send(res, 404, 'Not found');
    } catch (error) {
        send(res, error.status ?? 500, error.status ? error.message : 'Server error');
        if (!error.status) console.error(error);
    }
}

export const createShared = () => createServer(handle);
