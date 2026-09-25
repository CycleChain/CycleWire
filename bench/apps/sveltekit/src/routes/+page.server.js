// The Wirestore page's data and its two form actions. Everything comes from the
// scenario's shared modules.
import { error, fail } from '@sveltejs/kit';
import { COOKIE, add, readCart } from '$scenario/cart.js';
import { detail, listing, product, products, summary } from '$scenario/catalog.js';
import { INVALID_EMAIL, thanks, validEmail } from '$scenario/markup.js';

/**
 * The cart in the `cart` cookie, parsed and checked by the shared module.
 * `cookies.get` also sees a cookie an action has set earlier in this request,
 * so a form post without JavaScript renders the updated cart.
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
function cartIn(cookies) {
	const value = cookies.get(COOKIE);
	return value ? readCart(`${COOKIE}=${encodeURIComponent(value)}`) : {};
}

/**
 * Only `view` is read from the URL. SvelteKit tracks search parameters one by
 * one, so changing the search or the category (which the page reads from the
 * URL itself) does not run this again.
 * @type {import('./$types').PageServerLoad}
 */
export function load({ cookies, url }) {
	const shown = product(url.searchParams.get('view') ?? '');
	return {
		cart: summary(cartIn(cookies)),
		products: products.map(listing),
		quickView: shown ? detail(shown) : null
	};
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	add: async ({ cookies, request }) => {
		const next = add(cartIn(cookies), String((await request.formData()).get('id') ?? ''));
		if (!next) error(404, 'No such product');
		cookies.set(COOKIE, JSON.stringify(next), { path: '/' });
	},

	subscribe: async ({ request }) => {
		const email = String((await request.formData()).get('email') ?? '').trim();
		if (!validEmail(email)) return fail(422, { email, message: INVALID_EMAIL });
		return { message: thanks(email) };
	}
};
