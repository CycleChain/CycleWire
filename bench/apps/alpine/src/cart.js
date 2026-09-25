// The cart store: the header's count and total, which every "Add to cart"
// form on the page changes. It starts from the cart the server read from the
// cookie, and the shared API keeps the cookie up to date.
import { formatPrice } from '../../../scenario/markup.js';

/** @param {{ count: number, total: number }} initial */
export default ({ count, total }) => ({
    count,
    total,

    get totalText() {
        return formatPrice(this.total);
    },

    /** Adds one of a product: `@submit.prevent="$store.cart.add(id)"`. */
    async add(id) {
        const response = await fetch('/api/cart', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        if (!response.ok) throw new Error(`The cart answered ${response.status}`);
        const cart = await response.json();
        this.count = cart.count;
        this.total = cart.total;
    },
});
