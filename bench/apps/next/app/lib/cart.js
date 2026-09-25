import { cookies } from 'next/headers';
import { readCart } from '@scenario/cart.js';

/**
 * The cart in the request's `cart` cookie: product id → quantity.
 *
 * The shared readCart() parses a Cookie header, which is what
 * cookies().toString() returns. When a Server Action has just set the
 * cookie, the render that follows in the same response reads the new value.
 */
export async function getCart() {
    return readCart((await cookies()).toString());
}
