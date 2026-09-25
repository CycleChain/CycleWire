/**
 * The cart lives in a cookie, so servers keep no state between runs and
 * every stack can read it while rendering. Its value is URL-encoded JSON:
 * product id → quantity.
 */
import { product } from './catalog.js';

export const COOKIE = 'cart';
const MAX_QUANTITY = 99;

/**
 * @param {string | undefined} header the request's Cookie header
 * @returns {Record<string, number>}
 */
export function readCart(header) {
    const match = /(?:^|;\s*)cart=([^;]*)/.exec(header ?? '');
    if (!match) return {};
    try {
        const items = JSON.parse(decodeURIComponent(match[1]));
        const clean = {};
        for (const [id, quantity] of Object.entries(items ?? {})) {
            if (product(id) && Number.isInteger(quantity) && quantity > 0) clean[id] = Math.min(quantity, MAX_QUANTITY);
        }
        return clean;
    } catch {
        return {};
    }
}

/**
 * Adds one of a product. Returns null for unknown products.
 * @param {Record<string, number>} items
 * @param {string} id
 */
export function add(items, id) {
    if (!product(id)) return null;
    return { ...items, [id]: Math.min((items[id] ?? 0) + 1, MAX_QUANTITY) };
}

/** @param {Record<string, number>} items */
export const cartCookie = (items) => `${COOKIE}=${encodeURIComponent(JSON.stringify(items))}; Path=/; SameSite=Lax; HttpOnly`;
