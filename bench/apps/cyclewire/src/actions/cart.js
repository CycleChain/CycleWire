// The cart store is seeded from the JSON the server rendered, and the header
// is bound to it with cw-bind, so adding an item only changes the store.
import { store } from 'cyclewire/signals';
import { formatPrice } from '../../../../scenario/markup.js';

export async function add({ element, signal }) {
    const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: element.elements.namedItem('id').value }),
        signal,
    });
    if (!response.ok) throw new Error(`The cart answered ${response.status}`);
    const { count, total } = await response.json();
    const cart = store('cart', { get totalText() { return formatPrice(this.total); } });
    cart.count = count;
    cart.total = total;
}
