'use server';

import { cookies } from 'next/headers';
import { COOKIE, add } from '@scenario/cart.js';
import { INVALID_EMAIL, thanks, validEmail } from '@scenario/markup.js';
import { getCart } from '@/app/lib/cart';

/**
 * Adds one of the posted product to the cart. Setting a cookie in a Server
 * Action makes Next.js render the current route again and send it in the
 * same response, so the header shows the new cart without another request.
 * Without JavaScript, the form posts and the server answers with the page.
 */
export async function addToCart(formData) {
    const cart = add(await getCart(), String(formData.get('id') ?? ''));
    if (!cart) return; // not a product
    // The attributes of scenario/cart.js's cartCookie(); cookies().set() URL-encodes the value.
    (await cookies()).set(COOKIE, JSON.stringify(cart), { path: '/', sameSite: 'lax', httpOnly: true });
}

/**
 * The newsletter sign-up. Its result is the form's state in useActionState,
 * so the message the server wrote is what the page shows.
 */
export async function subscribe(previousState, formData) {
    const email = String(formData.get('email') ?? '').trim();
    return { message: validEmail(email) ? thanks(email) : INVALID_EMAIL };
}
