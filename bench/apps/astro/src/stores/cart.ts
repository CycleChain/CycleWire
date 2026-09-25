// The cart, shared between the islands that change it (the catalog and the
// quick view) and the one that shows it (the header).
import { actions } from 'astro:actions';
import { atom } from 'nanostores';

export interface CartSummary {
    count: number;
    /** In cents. */
    total: number;
}

/**
 * The cart as the server last reported it to this page. It stays null until
 * the page changes the cart, and until then the header shows what the server
 * rendered. Only the browser writes to it.
 */
export const $cart = atom<CartSummary | null>(null);

/** Sends an add-to-cart form through the addToCart action and publishes the new cart. */
export async function addToCart(form: HTMLFormElement) {
    const { data, error } = await actions.addToCart(new FormData(form));
    if (error) return;
    $cart.set(data);
}
