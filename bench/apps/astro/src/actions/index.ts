// The server functions the page calls: from the islands with the `actions`
// client, and from the plain HTML forms when JavaScript has not run. They use
// the scenario's shared catalog, cart and markup modules.
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { COOKIE, add, readCart } from '../../../../scenario/cart.js';
import { detail, product, summary } from '../../../../scenario/catalog.js';
import { INVALID_EMAIL, thanks, validEmail } from '../../../../scenario/markup.js';
import type { ProductDetail } from '../stores/quick-view';

export const server = {
    /** Adds one of a product to the cart cookie and returns the header's count and total. */
    addToCart: defineAction({
        accept: 'form',
        input: z.object({ id: z.string() }),
        handler: ({ id }, context) => {
            const items = add(readCart(context.request.headers.get('cookie') ?? undefined), id);
            if (!items) throw new ActionError({ code: 'NOT_FOUND', message: 'No such product.' });
            // The same cookie as the scenario's cartCookie(): URL-encoded JSON.
            context.cookies.set(COOKIE, JSON.stringify(items), { path: '/', sameSite: 'lax', httpOnly: true });
            return summary(items);
        },
    }),

    /** A product with its description, for the quick view. */
    getProduct: defineAction({
        input: z.object({ id: z.string() }),
        handler: ({ id }) => {
            const found = product(id);
            if (!found) throw new ActionError({ code: 'NOT_FOUND', message: 'No such product.' });
            // detail() is untyped JavaScript: it returns the product without its image parameters.
            return detail(found) as ProductDetail;
        },
    }),

    /** Signs an address up for the newsletter, with the scenario's rule and messages. */
    newsletter: defineAction({
        accept: 'form',
        input: z.object({
            // An empty field arrives as null, which fails with the same message.
            email: z.string({ error: INVALID_EMAIL }).trim().refine(validEmail, { error: INVALID_EMAIL }),
        }),
        handler: ({ email }) => ({ message: thanks(email) }),
    }),
};
